import { AIMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createActionBatchAdmission } from '@/lib/ai/runtime/general-react-agent/action-batch-admission'
import { createGeneralReActInitialState } from '@/lib/ai/runtime/general-react-agent/agent-state'
import { evaluateAfterModelPolicy, evaluateBeforeModelPolicy } from '@/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware'
import { RetryPermitPool } from '@/lib/ai/runtime/general-react-agent/retry-permit-pool'
import { createGeneralReActRuntimeConfig, GENERAL_REACT_RUNTIME_DEFAULTS } from '@/lib/ai/runtime/general-react-agent/runtime-config'
import { normalizeAndValidateToolCall } from '@/lib/ai/runtime/tool-runtime/validation'
import type { ChatToolDefinition } from '@/lib/ai/tools'

describe('general-react-agent runtime policy matrix', () => {
    it('keeps the total model budget equal to Action budget plus the reserved Answer call', () => {
        expect(GENERAL_REACT_RUNTIME_DEFAULTS.maxModelCalls).toBe(
            GENERAL_REACT_RUNTIME_DEFAULTS.maxActionModelCalls + GENERAL_REACT_RUNTIME_DEFAULTS.reservedAnswerModelCalls
        )
    })

    it('rejects a runtime budget that would silently consume the reserved Answer call', () => {
        expect(() =>
            createGeneralReActRuntimeConfig({
                ...GENERAL_REACT_RUNTIME_DEFAULTS,
                maxModelCalls: GENERAL_REACT_RUNTIME_DEFAULTS.maxModelCalls - 1,
            })
        ).toThrow('maxModelCalls')
    })

    it('rejects unknown and invalid tool calls before provider execution', () => {
        const definition: ChatToolDefinition<{ expression: string }> = {
            executionPolicy: {
                kind: 'standard-tool',
                profile: 'local-deterministic',
                retrySafe: false,
            },
            name: 'calculator',
            schema: z.object({ expression: z.string().min(1) }),
            tool: {} as never,
        }
        const definitions = new Map([[definition.name, definition]])

        expect(
            normalizeAndValidateToolCall({ args: { expression: '' }, id: 'invalid', name: 'calculator', type: 'tool_call' }, definitions)
        ).toMatchObject({ success: false })
        expect(normalizeAndValidateToolCall({ args: {}, id: 'unknown', name: 'missing', type: 'tool_call' }, definitions)).toMatchObject({
            success: false,
        })
    })

    it('keeps duplicate calls invalid and admits only the first nine logical calls', () => {
        const state = createGeneralReActInitialState(0)
        const duplicate = evaluateAfterModelPolicy({
            batchId: 'duplicate-batch',
            message: new AIMessage({
                content: '',
                tool_calls: [
                    { args: {}, id: 'same', name: 'datetime', type: 'tool_call' },
                    { args: {}, id: 'same', name: 'datetime', type: 'tool_call' },
                ],
            }),
            state,
        })
        expect(duplicate._stopReason).toBe('agent_contract_violation')

        const admission = createActionBatchAdmission({
            actionRound: 1,
            batchId: 'nine-calls',
            callIds: Array.from({ length: 10 }, (_, index) => `call-${index + 1}`),
            observationCharsUsed: 0,
            toolCallsUsed: 0,
        })
        expect(admission.reservedToolCallCount).toBe(GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls)
        expect(admission.admissions['call-10']).toMatchObject({ admitted: false, blockedReason: 'tool_call_limit' })
    })

    it('stops at explicit Action/model/deadline budgets while reserving exactly one Answer call', () => {
        const state = createGeneralReActInitialState(1_000)
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: {
                    ...state,
                    _actionModelCallCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxActionModelCalls - 1,
                    _actionRoundCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxToolBearingActionRounds,
                },
            })
        ).toMatchObject({ _runPhase: 'acting', _stopReason: null })
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 1_000 + GENERAL_REACT_RUNTIME_DEFAULTS.actionDeadlineMs,
                runAborted: false,
                state,
            })
        ).toMatchObject({ _stopReason: 'action_deadline', jumpTo: 'end' })
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 1_000 + GENERAL_REACT_RUNTIME_DEFAULTS.hardDeadlineMs,
                runAborted: false,
                state,
            })
        ).toMatchObject({ _stopReason: 'run_deadline', jumpTo: 'end' })
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: { ...state, _actionModelCallCount: GENERAL_REACT_RUNTIME_DEFAULTS.maxActionModelCalls },
            })
        ).toMatchObject({ _finalizationMode: 'constrained', _runPhase: 'answering', _stopReason: 'model_call_limit', jumpTo: 'end' })
    })

    it('enters the constrained Answer Phase when observation budget is exhausted', () => {
        const state = createGeneralReActInitialState(1_000)
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: false,
                state: { ...state, _observationChars: GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars },
            })
        ).toMatchObject({
            _finalizationMode: 'constrained',
            _stopReason: 'observation_limit',
            _runPhase: 'answering',
            jumpTo: 'end',
        })
    })

    it('does not enter Answer Phase after cancellation or the hard deadline', () => {
        const state = createGeneralReActInitialState(1_000)
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 2_000,
                runAborted: true,
                state,
            })
        ).toMatchObject({ _runPhase: 'cancelled', _stopReason: 'request_cancelled', jumpTo: 'end' })
        expect(
            evaluateBeforeModelPolicy({
                nowMs: 1_000 + GENERAL_REACT_RUNTIME_DEFAULTS.hardDeadlineMs,
                runAborted: false,
                state,
            })
        ).toMatchObject({ _runPhase: 'failed', _stopReason: 'run_deadline', jumpTo: 'end' })
    })

    it('allocates at most two retries per call and four retries per run', () => {
        const pool = new RetryPermitPool()
        expect(pool.tryAcquire({ callId: 'a', retryOrdinal: 1 })).not.toBeNull()
        expect(pool.tryAcquire({ callId: 'a', retryOrdinal: 2 })).not.toBeNull()
        expect(pool.tryAcquire({ callId: 'a', retryOrdinal: 2 })).toBeNull()
        expect(pool.tryAcquire({ callId: 'b', retryOrdinal: 2 })).toBeNull()
        expect(pool.tryAcquire({ callId: 'b', retryOrdinal: 1 })).not.toBeNull()
        expect(pool.tryAcquire({ callId: 'c', retryOrdinal: 1 })).not.toBeNull()
        expect(pool.tryAcquire({ callId: 'd', retryOrdinal: 1 })).toBeNull()
        expect(pool.tryAcquire({ callId: 'e', retryOrdinal: 1 })).toBeNull()
    })
})
