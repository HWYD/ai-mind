import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../../types'
import type { PlanningDecisionOutput, TasklistStrategy } from '../contract/types'
import type { VersionPlanTasklistGraphStateAnnotationState, VersionPlanTasklistGraphStatePatch } from '../graph/graph-state'
import { runTasklistAgentModelStep, type TasklistAgentModelStageName } from '../model/tasklist-agent-model-execution'
import { generatePlanningDecisionOutput, generateTasklistStrategy } from '../planner/planning-decision'
import { applyVersionPlanTasklistGraphAction } from '../state/state-machine'
import { getRevisionFinalDecisionLabel } from '../stream/tasklist-agent-output'
import { evaluateRevisionEffect } from '../tasklist/revision-effect'
import { createValidationResultForRevision } from '../tasklist/tasklist-agent-validation'
import { generateTasklistDraft, reviseTasklistDraft } from '../tasklist/tasklist-draft-generator'
import { decideWarningDisposition } from '../tasklist/warning-disposition'

interface TasklistAgentStepOperationOptions {
    context: ChatExecutionContext
    model: ChatSession['baseModel']
    modelStage: TasklistAgentModelStageName
    modelTimeoutMs: number
    state: VersionPlanTasklistGraphStateAnnotationState
    userGoal: string
    writeChunk: WriteChunk
}

function createPromptState(state: VersionPlanTasklistGraphStateAnnotationState) {
    return {
        artifacts: {
            planning: state.planning,
            tasklistDraft: state.tasklist.draft,
            versionPlan: state.source.versionPlan,
        },
        versionPlanReference: state.source.versionPlanReference,
    }
}

export function runPlanReadinessStep(options: {
    state: VersionPlanTasklistGraphStateAnnotationState
    writeChunk: WriteChunk
}): VersionPlanTasklistGraphStatePatch {
    const readiness = options.state.planning.readiness

    if (!readiness) {
        throw new Error('Missing PlanReadinessResult.')
    }

    return applyVersionPlanTasklistGraphAction(options.state, {
        reason: readiness.reason,
        type: 'check_plan_readiness',
    })
}

export async function runPlanningDecisionStep(options: TasklistAgentStepOperationOptions): Promise<{
    output: PlanningDecisionOutput
    update: VersionPlanTasklistGraphStatePatch
}> {
    const output = await runTasklistAgentModelStep({
        operation: signal => generatePlanningDecisionOutput(options.model, createPromptState(options.state), options.userGoal, signal),
        signal: options.context.signal,
        stage: options.modelStage,
        timeoutMs: options.modelTimeoutMs,
    })
    const update = applyVersionPlanTasklistGraphAction(options.state, {
        decision: output.decision,
        reason: output.decision.reason,
        type: 'planning_decision',
    })

    return {
        output,
        update,
    }
}

export async function runTasklistStrategyStep(
    options: TasklistAgentStepOperationOptions & { strategy?: TasklistStrategy }
): Promise<VersionPlanTasklistGraphStatePatch> {
    const strategy =
        options.strategy ??
        (await runTasklistAgentModelStep({
            operation: signal => generateTasklistStrategy(options.model, createPromptState(options.state), options.userGoal, signal),
            signal: options.context.signal,
            stage: options.modelStage,
            timeoutMs: options.modelTimeoutMs,
        }))

    return applyVersionPlanTasklistGraphAction(options.state, {
        reason: strategy.reason,
        strategy,
        type: 'decide_tasklist_strategy',
    })
}

export async function runDraftTasklistStep(options: TasklistAgentStepOperationOptions): Promise<VersionPlanTasklistGraphStatePatch> {
    const versionPlan = options.state.source.versionPlan
    const draftText = await runTasklistAgentModelStep({
        operation: signal => generateTasklistDraft(options.model, createPromptState(options.state), options.userGoal, signal),
        signal: options.context.signal,
        stage: options.modelStage,
        timeoutMs: options.modelTimeoutMs,
    })
    const update = applyVersionPlanTasklistGraphAction(options.state, {
        goal: options.userGoal || '基于版本方案生成任务清单草稿',
        planUri: versionPlan?.uri ?? options.state.source.versionPlanReference.uri,
        reason: '基于已读取的 version plan 生成任务清单草稿 v1。',
        targetVersion: versionPlan?.extract?.targetVersion,
        type: 'draft_tasklist',
    })
    const draft = update.tasklist?.draft

    if (!draft) {
        throw new Error('Missing tasklist draft placeholder.')
    }

    return {
        ...update,
        tasklist: {
            draft: {
                ...draft,
                content: draftText,
            },
        },
    }
}

export function runWarningDispositionStep(options: {
    result: TasklistValidationResult
    state: VersionPlanTasklistGraphStateAnnotationState
    writeChunk: WriteChunk
}): { disposition: ReturnType<typeof decideWarningDisposition>; update: VersionPlanTasklistGraphStatePatch } {
    const disposition = decideWarningDisposition(options.result)
    const update = applyVersionPlanTasklistGraphAction(options.state, {
        disposition,
        reason: disposition.reason,
        type: 'decide_warning_disposition',
    })

    return {
        disposition,
        update,
    }
}

export function runRevisionEffectStep(options: {
    state: VersionPlanTasklistGraphStateAnnotationState
    writeChunk: WriteChunk
}): VersionPlanTasklistGraphStatePatch {
    const draft = options.state.tasklist.draft
    const validationBefore = draft?.validationV1
    const validationAfter = draft?.validationV2 ?? validationBefore

    if (!validationBefore || !validationAfter) {
        throw new Error('Missing tasklist validation result.')
    }

    const effect = evaluateRevisionEffect({
        hasManualReviewItems: options.state.planning.manualReviewItems.length > 0,
        validationAfter,
        validationBefore,
    })

    return applyVersionPlanTasklistGraphAction(options.state, {
        effect,
        reason: `修正效果评估完成，最终决策为 ${getRevisionFinalDecisionLabel(effect.finalDecision)}。`,
        type: 'evaluate_revision_effect',
    })
}

export async function runReviseTasklistStep(options: TasklistAgentStepOperationOptions): Promise<VersionPlanTasklistGraphStatePatch> {
    const draft = options.state.tasklist.draft
    const validationResult = draft?.validationV1
    const warningDisposition = options.state.planning.warningDisposition

    if (!draft || !validationResult || !warningDisposition) {
        throw new Error('Missing draft, validation result, or warning disposition.')
    }

    const revisionValidationResult = createValidationResultForRevision(validationResult, warningDisposition.fixNow)
    const revisedDraftText = await runTasklistAgentModelStep({
        operation: signal => reviseTasklistDraft(options.model, createPromptState(options.state), draft, revisionValidationResult, signal),
        signal: options.context.signal,
        stage: options.modelStage,
        timeoutMs: options.modelTimeoutMs,
    })
    const update = applyVersionPlanTasklistGraphAction(options.state, {
        reason: '根据结构校验 findings 自动修正一次任务清单草稿。',
        type: 'revise_tasklist',
    })
    const revisedDraft = update.tasklist?.draft

    if (!revisedDraft) {
        throw new Error('Missing revised tasklist draft placeholder.')
    }

    return {
        ...update,
        tasklist: {
            draft: {
                ...revisedDraft,
                content: revisedDraftText,
            },
        },
    }
}
