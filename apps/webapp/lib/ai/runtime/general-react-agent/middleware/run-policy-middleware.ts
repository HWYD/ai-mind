import { AIMessage, type BaseMessage, ToolMessage } from '@langchain/core/messages'
import { createMiddleware } from 'langchain'

import { createActionBatchAdmission } from '@/lib/ai/runtime/general-react-agent/action-batch-admission'
import { generalReActRunContextSchema } from '@/lib/ai/runtime/general-react-agent/agent-context'
import {
    createGeneralReActInitialState,
    type GeneralReActAgentState,
    generalReActAgentStateSchema,
    type GeneralReActAgentStateUpdate,
} from '@/lib/ai/runtime/general-react-agent/agent-state'
import { normalizeModelTurnFinish } from '@/lib/ai/runtime/general-react-agent/model-turn-finish-normalizer'
import { GENERAL_REACT_RUNTIME_DEFAULTS } from '@/lib/ai/runtime/general-react-agent/runtime-config'

export type GeneralReActStopReason = NonNullable<GeneralReActAgentState['_stopReason']>

export type GeneralReActStopSignals = Partial<{
    actionDeadline: boolean
    actionRoundLimit: boolean
    agentContractViolation: boolean
    modelCallLimit: boolean
    modelError: boolean
    noProgress: boolean
    observationLimit: boolean
    requestCancelled: boolean
    runDeadline: boolean
    securityDenied: boolean
    toolCallLimit: boolean
    toolFailure: boolean
}>

export interface GeneralReActMessageUsage {
    actionRoundCount: number
    executedToolCallCount: number
    modelCallCount: number
    observationChars: number
    toolCallCount: number
    toolRequestCount: number
    toolRetryCount: number
}

export function deriveGeneralReActMessageUsage(messages: readonly BaseMessage[]): GeneralReActMessageUsage {
    const aiMessages = messages.filter(message => AIMessage.isInstance(message))
    const toolCalls = aiMessages.flatMap(message => (AIMessage.isInstance(message) ? (message.tool_calls ?? []) : []))
    const toolMessages = messages.filter(message => ToolMessage.isInstance(message))

    return {
        actionRoundCount: aiMessages.filter(message => AIMessage.isInstance(message) && (message.tool_calls?.length ?? 0) > 0).length,
        executedToolCallCount: toolMessages.reduce((total, message) => {
            return total + (message.metadata?.executed === true ? 1 : 0)
        }, 0),
        modelCallCount: aiMessages.length,
        observationChars: toolMessages.reduce((total, message) => total + message.text.length, 0),
        toolCallCount: toolCalls.length,
        toolRequestCount: toolCalls.length,
        toolRetryCount: toolMessages.reduce((total, message) => {
            const retryCount = message.metadata?.retryCount
            return total + (typeof retryCount === 'number' && Number.isFinite(retryCount) ? retryCount : 0)
        }, 0),
    }
}

type GeneralReActPolicyUpdate = GeneralReActAgentStateUpdate & {
    jumpTo?: 'end'
}

const noProgressStatuses = new Set([
    'budget_blocked',
    'cancelled',
    'denied',
    'duplicate',
    'execution_error',
    'provider_error',
    'timeout',
    'validation_error',
])

export function selectGeneralReActStopReason(signals: GeneralReActStopSignals): GeneralReActStopReason | null {
    const priority: Array<[keyof GeneralReActStopSignals, GeneralReActStopReason]> = [
        ['requestCancelled', 'request_cancelled'],
        ['runDeadline', 'run_deadline'],
        ['agentContractViolation', 'agent_contract_violation'],
        ['actionDeadline', 'action_deadline'],
        ['modelCallLimit', 'model_call_limit'],
        ['actionRoundLimit', 'action_round_limit'],
        ['toolCallLimit', 'tool_call_limit'],
        ['observationLimit', 'observation_limit'],
        ['noProgress', 'no_progress'],
        ['modelError', 'model_error'],
        ['toolFailure', 'tool_failure'],
        ['securityDenied', 'security_denied'],
    ]

    return priority.find(([signal]) => signals[signal])?.[1] ?? null
}

export function resolveNoProgressRounds(previous: number, statuses: readonly string[]): number {
    if (statuses.length === 0 || statuses.some(status => !noProgressStatuses.has(status))) {
        return 0
    }

    return Math.min(previous + 1, GENERAL_REACT_RUNTIME_DEFAULTS.maxNoProgressRounds)
}

export function createGeneralReActToolFingerprint(toolName: string, args: unknown): string {
    return `${toolName}:${JSON.stringify(sortJsonValue(args))}`
}

export function evaluateBeforeModelPolicy(input: {
    messages?: readonly BaseMessage[]
    nowMs: number
    runAborted: boolean
    state: GeneralReActAgentState
    batchStatuses?: readonly string[]
}): GeneralReActPolicyUpdate {
    if (input.state._stopReason) {
        return stopUpdate(input.state._stopReason)
    }

    // messages 包含 Chat Memory 和本次请求的完整上下文，不能把它当作本次 Run 的预算事实源。
    // Run-local counters 由 middleware/tool runtime 的 state delta 维护，历史消息只作为模型上下文。
    const effectiveState = input.state
    const noProgressRounds = input.batchStatuses
        ? resolveNoProgressRounds(input.state._noProgressRounds, input.batchStatuses)
        : input.state._noProgressRounds
    const admissions = effectiveState._currentActionBatch?.admissions ?? {}
    const stopReason = selectGeneralReActStopReason({
        actionDeadline: input.nowMs >= effectiveState._loopDeadlineAtMs,
        modelCallLimit: effectiveState._loopModelCallCount >= GENERAL_REACT_RUNTIME_DEFAULTS.maxLoopModelCalls,
        noProgress: noProgressRounds >= GENERAL_REACT_RUNTIME_DEFAULTS.maxNoProgressRounds,
        observationLimit:
            effectiveState._observationChars >= GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars ||
            Object.values(admissions).some(admission => admission.blockedReason === 'observation_limit'),
        requestCancelled: input.runAborted,
        runDeadline: input.nowMs >= effectiveState._hardDeadlineAtMs,
        toolCallLimit: Object.values(admissions).some(admission => admission.blockedReason === 'tool_call_limit'),
    })

    if (stopReason) {
        return { ...stopUpdate(stopReason), _noProgressRounds: noProgressRounds }
    }

    return {
        _currentActionBatch: null,
        _noProgressRounds: noProgressRounds,
        _runPhase: 'looping',
        _stopReason: null,
    }
}

export function evaluateAfterModelPolicy(input: {
    batchId: string
    message: AIMessage
    messages?: readonly BaseMessage[]
    nowMs?: number
    state: GeneralReActAgentState
}): GeneralReActPolicyUpdate {
    const toolCalls = input.message.tool_calls ?? []
    if (input.state._finalizationMode === 'normal' && toolCalls.length > 0) {
        return stopUpdate('agent_contract_violation')
    }

    if (toolCalls.length === 0) {
        const finish = normalizeModelTurnFinish(input.message)
        if (finish.disposition === 'blocked') {
            return stopUpdate('agent_contract_violation')
        }
        if (finish.disposition === 'constrained') {
            return stopUpdate('model_error')
        }
        const deadlineStopReason =
            input.nowMs === undefined
                ? null
                : selectGeneralReActStopReason({
                      actionDeadline: input.nowMs >= input.state._loopDeadlineAtMs,
                      runDeadline: input.nowMs >= input.state._hardDeadlineAtMs,
                  })
        if (deadlineStopReason) {
            return stopUpdate(deadlineStopReason)
        }

        if (hasVisibleText(input.message)) {
            return {
                _finalizationMode: 'normal',
                _runPhase: 'finalizing',
                _stopReason: 'natural_completion',
                jumpTo: 'end',
            }
        }

        return stopUpdate('agent_contract_violation')
    }

    const callIds = toolCalls.map(call => call.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (callIds.length !== toolCalls.length || new Set(callIds).size !== callIds.length) {
        return stopUpdate('agent_contract_violation')
    }

    const nowMs = input.nowMs
    const previousUsage = {
        actionRoundCount: input.state._toolBearingRoundCount,
        actionModelCallCount: input.state._loopModelCallCount,
        observationChars: input.state._observationChars,
        toolCallCount: input.state._toolCallCount,
    }
    const stopReason =
        nowMs === undefined
            ? null
            : selectGeneralReActStopReason({
                  actionDeadline: nowMs >= input.state._loopDeadlineAtMs,
                  modelCallLimit: previousUsage.actionModelCallCount + 1 >= GENERAL_REACT_RUNTIME_DEFAULTS.maxLoopModelCalls,
                  runDeadline: nowMs >= input.state._hardDeadlineAtMs,
              })
    if (stopReason) {
        return stopUpdate(stopReason)
    }

    const actionRound = previousUsage.actionRoundCount + 1
    if (actionRound > GENERAL_REACT_RUNTIME_DEFAULTS.maxToolBearingRounds) {
        return stopUpdate('action_round_limit')
    }
    const admission = createActionBatchAdmission({
        actionRound,
        batchId: input.batchId,
        callIds,
        observationCharsUsed: previousUsage.observationChars,
        toolCallsUsed: previousUsage.toolCallCount,
    })

    return {
        _toolBearingRoundCount: boundedCounterDelta(
            input.state._toolBearingRoundCount,
            GENERAL_REACT_RUNTIME_DEFAULTS.maxToolBearingRounds,
            1
        ),
        _currentActionBatch: admission,
        _runPhase: 'looping',
        _toolCallCount: boundedCounterDelta(
            input.state._toolCallCount,
            GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls,
            admission.reservedToolCallCount
        ),
        _toolRequestCount: toolCalls.length,
    }
}

export function createGeneralReActRunPolicyMiddleware(
    options: {
        captureFinalState?: (state: GeneralReActAgentState) => void
    } = {}
) {
    return createMiddleware({
        name: 'GeneralReActRunPolicyMiddleware',
        contextSchema: generalReActRunContextSchema,
        stateSchema: generalReActAgentStateSchema,
        beforeAgent: (state, runtime) => {
            if (state._startedAtMs > 0) {
                return
            }
            return createGeneralReActInitialState(runtime.context.clock.now(), state.messages, runtime.context.trustedUserUrls)
        },
        beforeModel: {
            canJumpTo: ['end'],
            hook: (state, runtime) =>
                evaluateBeforeModelPolicy({
                    batchStatuses: getCurrentBatchStatuses(state.messages, state._currentActionBatch?.orderedCallIds ?? []),
                    nowMs: runtime.context.clock.now(),
                    runAborted: runtime.context.runSignal.aborted,
                    state,
                }),
        },
        afterModel: {
            canJumpTo: ['end'],
            hook: (state, runtime) => {
                const message = state.messages.at(-1)
                if (!message || !AIMessage.isInstance(message)) {
                    return stopUpdate('agent_contract_violation')
                }

                const update = evaluateAfterModelPolicy({
                    batchId: `loop-${state._toolBearingRoundCount + 1}`,
                    message,
                    nowMs: runtime.context.clock.now(),
                    state,
                })
                return {
                    ...update,
                    _loopModelCallCount: boundedCounterDelta(
                        state._loopModelCallCount,
                        GENERAL_REACT_RUNTIME_DEFAULTS.maxLoopModelCalls,
                        1
                    ),
                }
            },
        },
        afterAgent: state => {
            options.captureFinalState?.(state)
        },
    })
}

function stopUpdate(stopReason: GeneralReActStopReason): GeneralReActPolicyUpdate {
    if (stopReason !== 'request_cancelled' && stopReason !== 'run_deadline') {
        return {
            _currentActionBatch: null,
            _finalizationMode: 'constrained',
            _runPhase: 'finalizing',
            _stopReason: stopReason,
            jumpTo: 'end',
        }
    }

    return {
        _currentActionBatch: null,
        _runPhase: stopReason === 'request_cancelled' ? 'cancelled' : 'failed',
        _stopReason: stopReason,
        jumpTo: 'end',
    }
}

function boundedCounterDelta(current: number, maximum: number, delta: number) {
    return Math.max(0, Math.min(delta, maximum - current))
}

function getCurrentBatchStatuses(messages: readonly unknown[], orderedCallIds: readonly string[]): string[] | undefined {
    if (orderedCallIds.length === 0) {
        return undefined
    }

    const messagesByCallId = new Map<string, ToolMessage>()
    for (const message of messages) {
        if (ToolMessage.isInstance(message)) {
            messagesByCallId.set(message.tool_call_id, message)
        }
    }

    const currentMessages = orderedCallIds.map(callId => messagesByCallId.get(callId))
    if (currentMessages.some(message => !message)) {
        return undefined
    }

    return currentMessages.map(message => String(message?.metadata?.observationStatus ?? message?.status ?? 'execution_error'))
}

function hasVisibleText(message: AIMessage): boolean {
    return message.text.trim().length > 0
}

function sortJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJsonValue)
    }
    if (!value || typeof value !== 'object') {
        return value
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([, nested]) => nested !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, sortJsonValue(nested)])
    )
}
