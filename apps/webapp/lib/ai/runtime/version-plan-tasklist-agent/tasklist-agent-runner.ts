import { writeStaticTextPart } from '@ai-mind/stream-core'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../types'
import type { VersionPlanTasklistAgentState } from './contract/types'
import { readOptionalContextForTasklistAgent } from './resources/optional-context-reader'
import {
    runDraftTasklistStep,
    runPlanningDecisionStep,
    runPlanReadinessStep,
    runReviseTasklistStep,
    runRevisionEffectStep,
    runTasklistStrategyStep,
    runWarningDispositionStep,
} from './steps/tasklist-agent-steps'
import {
    buildControlledPlannerOutputFailureAnswer,
    buildStoppedPlanningDecisionAnswer,
    runFinalAnswerStep,
} from './stream/tasklist-agent-output'
import { getNextStepIndex } from './stream/tasklist-agent-step-stream'
import { runValidateTasklistStep } from './tasklist/tasklist-agent-validation'

interface RunVersionPlanTasklistAgentOptions {
    context: ChatExecutionContext
    initialState: VersionPlanTasklistAgentState
    model: ChatSession['baseModel']
    userGoal: string
    writeChunk: WriteChunk
}

/**
 * 执行受控 Tasklist Agent 主链路：生成草稿、结构校验、必要时修正一次，并输出最终答案。
 */
export async function runVersionPlanTasklistAgent(options: RunVersionPlanTasklistAgentOptions) {
    let state = runPlanReadinessStep({
        state: options.initialState,
        writeChunk: options.writeChunk,
    })
    let planningDecision: Awaited<ReturnType<typeof runPlanningDecisionStep>>

    try {
        planningDecision = await runPlanningDecisionStep({
            ...options,
            state,
        })
    } catch (error) {
        const failureAnswer = buildControlledPlannerOutputFailureAnswer(error)

        if (failureAnswer) {
            writeStaticTextPart(options.writeChunk, failureAnswer)

            return state
        }

        throw error
    }

    state = planningDecision.state

    if (
        planningDecision.output.decision.type === 'ask_clarification' ||
        planningDecision.output.decision.type === 'stop_with_boundary_message'
    ) {
        writeStaticTextPart(options.writeChunk, buildStoppedPlanningDecisionAnswer(planningDecision.output.decision))

        return state
    }

    if (planningDecision.output.decision.type === 'read_optional_context') {
        state = (
            await readOptionalContextForTasklistAgent(state, {
                context: options.context,
                resourceUri: planningDecision.output.decision.resourceUri,
                stepIndex: getNextStepIndex(state),
                writeChunk: options.writeChunk,
            })
        ).state
        try {
            state = await runTasklistStrategyStep({
                ...options,
                state,
            })
        } catch (error) {
            const failureAnswer = buildControlledPlannerOutputFailureAnswer(error)

            if (failureAnswer) {
                writeStaticTextPart(options.writeChunk, failureAnswer)

                return state
            }

            throw error
        }
    } else {
        if (!planningDecision.output.strategy) {
            throw new Error('规划决策选择继续生成任务清单，但缺少拆分策略。')
        }

        state = await runTasklistStrategyStep({
            ...options,
            state,
            strategy: planningDecision.output.strategy,
        })
    }
    state = await runDraftTasklistStep({
        ...options,
        state,
    })
    const validationV1 = await runValidateTasklistStep({
        context: options.context,
        state,
        title: '校验任务清单结构 v1',
        writeChunk: options.writeChunk,
    })

    state = validationV1.state
    const warningDisposition = runWarningDispositionStep({
        result: validationV1.result,
        state,
        writeChunk: options.writeChunk,
    })

    state = warningDisposition.state

    if (warningDisposition.disposition.fixNow.length > 0) {
        state = await runReviseTasklistStep({
            ...options,
            state,
        })
        state = (
            await runValidateTasklistStep({
                context: options.context,
                state,
                title: '再次校验任务清单结构 v2',
                writeChunk: options.writeChunk,
            })
        ).state
    }

    state = runRevisionEffectStep({
        state,
        writeChunk: options.writeChunk,
    })

    return runFinalAnswerStep({
        state,
        writeChunk: options.writeChunk,
    })
}
