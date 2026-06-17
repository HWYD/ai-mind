import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../../types'
import type { PlanningDecisionOutput, TasklistStrategy, VersionPlanTasklistAgentState } from '../contract/types'
import { generatePlanningDecisionOutput, generateTasklistStrategy } from '../planner/planning-decision'
import { applyVersionPlanTasklistAgentAction } from '../state/state-machine'
import { getRevisionFinalDecisionLabel } from '../stream/tasklist-agent-output'
import { evaluateRevisionEffect } from '../tasklist/revision-effect'
import { createValidationResultForRevision } from '../tasklist/tasklist-agent-validation'
import { generateTasklistDraft, reviseTasklistDraft } from '../tasklist/tasklist-draft-generator'
import { decideWarningDisposition } from '../tasklist/warning-disposition'

interface TasklistAgentStepOperationOptions {
    context: ChatExecutionContext
    model: ChatSession['baseModel']
    state: VersionPlanTasklistAgentState
    userGoal: string
    writeChunk: WriteChunk
}

function attachDraftContent(state: VersionPlanTasklistAgentState, content: string): VersionPlanTasklistAgentState {
    const draft = state.artifacts.tasklistDraft

    if (!draft) {
        throw new Error('缺少任务清单草稿 artifact，无法写入草稿内容。')
    }

    return {
        ...state,
        artifacts: {
            ...state.artifacts,
            tasklistDraft: {
                ...draft,
                content,
            },
        },
    }
}

export function runPlanReadinessStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const readiness = options.state.artifacts.planning.readiness

    if (!readiness) {
        throw new Error('缺少 PlanReadinessResult，无法执行规划决策。')
    }

    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'check_plan_readiness',
        reason: readiness.reason,
    })

    return nextState
}

export async function runPlanningDecisionStep(
    options: TasklistAgentStepOperationOptions
): Promise<{ output: PlanningDecisionOutput; state: VersionPlanTasklistAgentState }> {
    const output = await generatePlanningDecisionOutput(options.model, options.state, options.userGoal, options.context.signal)
    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'planning_decision',
        decision: output.decision,
        reason: output.decision.reason,
    })

    return {
        output,
        state: nextState,
    }
}

export async function runTasklistStrategyStep(options: TasklistAgentStepOperationOptions & { strategy?: TasklistStrategy }) {
    const strategy =
        options.strategy ?? (await generateTasklistStrategy(options.model, options.state, options.userGoal, options.context.signal))
    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'decide_tasklist_strategy',
        reason: strategy.reason,
        strategy,
    })

    return nextState
}

export async function runDraftTasklistStep(options: TasklistAgentStepOperationOptions) {
    const versionPlan = options.state.artifacts.versionPlan
    const draftText = await generateTasklistDraft(options.model, options.state, options.userGoal, options.context.signal)
    const advancedState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'draft_tasklist',
        goal: options.userGoal || '基于版本方案生成任务清单草稿',
        planUri: versionPlan?.uri ?? options.state.versionPlanReference.uri,
        reason: '基于已读取的 version plan 生成任务清单草稿 v1。',
        targetVersion: versionPlan?.extract?.targetVersion,
    })
    const nextState = attachDraftContent(advancedState, draftText)

    return nextState
}

export function runWarningDispositionStep(options: {
    result: TasklistValidationResult
    state: VersionPlanTasklistAgentState
    writeChunk: WriteChunk
}) {
    const disposition = decideWarningDisposition(options.result)
    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'decide_warning_disposition',
        disposition,
        reason: disposition.reason,
    })

    return {
        disposition,
        state: nextState,
    }
}

export function runRevisionEffectStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const draft = options.state.artifacts.tasklistDraft
    const validationBefore = draft?.validationV1
    const validationAfter = draft?.validationV2 ?? validationBefore

    if (!validationBefore || !validationAfter) {
        throw new Error('缺少 v1 / v2 结构校验结果，无法评估修正效果。')
    }

    const effect = evaluateRevisionEffect({
        hasManualReviewItems: options.state.artifacts.planning.manualReviewItems.length > 0,
        validationAfter,
        validationBefore,
    })
    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'evaluate_revision_effect',
        effect,
        reason: `修正效果评估完成，最终决策为 ${getRevisionFinalDecisionLabel(effect.finalDecision)}。`,
    })

    return nextState
}

export async function runReviseTasklistStep(options: TasklistAgentStepOperationOptions) {
    const draft = options.state.artifacts.tasklistDraft
    const validationResult = draft?.validationV1
    const warningDisposition = options.state.artifacts.planning.warningDisposition

    if (!draft || !validationResult || !warningDisposition) {
        throw new Error('缺少 v1 草稿、校验结果或 warning disposition，无法执行自动修正。')
    }

    const revisionValidationResult = createValidationResultForRevision(validationResult, warningDisposition.fixNow)
    const revisedDraftText = await reviseTasklistDraft(
        options.model,
        options.state,
        draft,
        revisionValidationResult,
        options.context.signal
    )
    const advancedState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'revise_tasklist',
        reason: '根据结构校验 findings 自动修正一次任务清单草稿。',
    })
    const nextState = attachDraftContent(advancedState, revisedDraftText)

    return nextState
}
