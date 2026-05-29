import { writeStaticTextPart } from '@ai-mind/stream-core'

import type { TasklistValidationResult } from '@/lib/ai/tools/tasklist-structure'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../types'
import type { PlanningDecisionAction, PlanningDecisionOutput, TasklistStrategy, VersionPlanTasklistAgentState } from './contract/types'
import { generatePlanningDecisionOutput, generateTasklistStrategy } from './planner/planning-decision'
import { readOptionalContextForTasklistAgent } from './resources/optional-context-reader'
import { applyVersionPlanTasklistAgentAction } from './state/state-machine'
import {
    buildControlledPlannerOutputFailureAnswer,
    buildStoppedPlanningDecisionAnswer,
    getRevisionFinalDecisionLabel,
    runFinalAnswerStep,
} from './stream/tasklist-agent-output'
import { endAgentStep, getNextStepIndex, startAgentStep } from './stream/tasklist-agent-step-stream'
import { evaluateRevisionEffect } from './tasklist/revision-effect'
import { createValidationResultForRevision, runValidateTasklistStep } from './tasklist/tasklist-agent-validation'
import { generateTasklistDraft, reviseTasklistDraft } from './tasklist/tasklist-draft-generator'
import { decideWarningDisposition } from './tasklist/warning-disposition'

interface RunVersionPlanTasklistAgentOptions {
    context: ChatExecutionContext
    initialState: VersionPlanTasklistAgentState
    model: ChatSession['baseModel']
    userGoal: string
    writeChunk: WriteChunk
}

function getTasklistGranularityLabel(granularity: TasklistStrategy['granularity']) {
    const labels: Record<TasklistStrategy['granularity'], string> = {
        coarse: '粗粒度',
        detailed: '细粒度',
        medium: '中等粒度',
    }

    return labels[granularity]
}

function getPlanningDecisionSummary(decision: PlanningDecisionAction) {
    switch (decision.type) {
        case 'proceed_to_tasklist_strategy':
            return '版本方案信息足够，继续进入任务清单拆分策略。'
        case 'read_optional_context':
            return `需要补读 1 个白名单上下文：${decision.resourceUri}。`
        case 'ask_clarification':
            return '缺少关键可补充信息，本轮输出澄清问题后结束。'
        case 'proceed_with_manual_review_items':
            return `存在 ${decision.reviewItems.length} 个需人工复核的轻度不确定点，但可继续生成。`
        case 'stop_with_boundary_message':
            return '当前输入不符合 Agent 边界，本轮停止。'
    }
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

function runPlanReadinessStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'check_plan_readiness',
        state: options.state,
        stepIndex,
        title: '判断版本方案完整性',
        writeChunk: options.writeChunk,
    })
    const readiness = options.state.artifacts.planning.readiness

    if (!readiness) {
        endAgentStep({
            actionType: 'check_plan_readiness',
            durationStartedAt: step.startedAt,
            error: '缺少 PlanReadinessResult。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: '判断版本方案完整性',
            writeChunk: options.writeChunk,
        })
        throw new Error('缺少 PlanReadinessResult，无法执行规划决策。')
    }

    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'check_plan_readiness',
        reason: readiness.reason,
    })

    endAgentStep({
        actionType: 'check_plan_readiness',
        durationStartedAt: step.startedAt,
        partId: step.partId,
        severity: readiness.status === 'blocked' ? 'warning' : 'info',
        state: nextState,
        stepIndex,
        summary: readiness.reason,
        tags: [`status: ${readiness.status}`, `missing: ${readiness.missingFields.length}`, `weak: ${readiness.weakFields.length}`],
        title: '判断版本方案完整性',
        writeChunk: options.writeChunk,
    })

    return nextState
}

async function runPlanningDecisionStep(
    options: RunVersionPlanTasklistAgentOptions & { state: VersionPlanTasklistAgentState }
): Promise<{ output: PlanningDecisionOutput; state: VersionPlanTasklistAgentState }> {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'planning_decision',
        state: options.state,
        stepIndex,
        title: '执行规划决策',
        writeChunk: options.writeChunk,
    })

    try {
        const output = await generatePlanningDecisionOutput(options.model, options.state, options.userGoal, options.context.signal)
        const nextState = applyVersionPlanTasklistAgentAction(options.state, {
            type: 'planning_decision',
            decision: output.decision,
            reason: output.decision.reason,
        })

        endAgentStep({
            actionType: 'planning_decision',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            severity:
                output.decision.type === 'ask_clarification' || output.decision.type === 'stop_with_boundary_message' ? 'warning' : 'info',
            state: nextState,
            stepIndex,
            summary: getPlanningDecisionSummary(output.decision),
            tags: [`action: ${output.decision.type}`],
            title: '执行规划决策',
            writeChunk: options.writeChunk,
        })

        return {
            output,
            state: nextState,
        }
    } catch (error) {
        endAgentStep({
            actionType: 'planning_decision',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : '规划决策失败。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: '执行规划决策',
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

async function runTasklistStrategyStep(
    options: RunVersionPlanTasklistAgentOptions & {
        state: VersionPlanTasklistAgentState
        strategy?: TasklistStrategy
    }
) {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'decide_tasklist_strategy',
        state: options.state,
        stepIndex,
        title: '判断任务清单拆分策略',
        writeChunk: options.writeChunk,
    })

    try {
        const strategy =
            options.strategy ?? (await generateTasklistStrategy(options.model, options.state, options.userGoal, options.context.signal))
        const nextState = applyVersionPlanTasklistAgentAction(options.state, {
            type: 'decide_tasklist_strategy',
            reason: strategy.reason,
            strategy,
        })

        endAgentStep({
            actionType: 'decide_tasklist_strategy',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            state: nextState,
            stepIndex,
            summary: `拆分粒度 ${getTasklistGranularityLabel(strategy.granularity)}，预计 ${strategy.expectedStepRange[0]}-${strategy.expectedStepRange[1]} 个 Step。`,
            tags: [`granularity: ${strategy.granularity}`, `range: ${strategy.expectedStepRange[0]}-${strategy.expectedStepRange[1]}`],
            title: '判断任务清单拆分策略',
            writeChunk: options.writeChunk,
        })

        return nextState
    } catch (error) {
        endAgentStep({
            actionType: 'decide_tasklist_strategy',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : '任务清单拆分策略生成失败。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: '判断任务清单拆分策略',
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

async function runDraftTasklistStep(options: RunVersionPlanTasklistAgentOptions) {
    const stepIndex = getNextStepIndex(options.initialState)
    const step = startAgentStep({
        actionType: 'draft_tasklist',
        state: options.initialState,
        stepIndex,
        title: '生成任务清单草稿 v1',
        writeChunk: options.writeChunk,
    })

    try {
        const versionPlan = options.initialState.artifacts.versionPlan
        const draftText = await generateTasklistDraft(options.model, options.initialState, options.userGoal, options.context.signal)
        const advancedState = applyVersionPlanTasklistAgentAction(options.initialState, {
            type: 'draft_tasklist',
            goal: options.userGoal || '基于版本方案生成任务清单草稿',
            planUri: versionPlan?.uri ?? options.initialState.versionPlanReference.uri,
            reason: '基于已读取的 version plan 生成任务清单草稿 v1。',
            targetVersion: versionPlan?.extract?.targetVersion,
        })
        const nextState = attachDraftContent(advancedState, draftText)

        endAgentStep({
            actionType: 'draft_tasklist',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            state: nextState,
            stepIndex,
            summary: `已生成任务清单草稿 v1，长度 ${draftText.length} 字符。`,
            tags: [`targetVersion: ${versionPlan?.extract?.targetVersion ?? 'unknown'}`],
            title: '生成任务清单草稿 v1',
            writeChunk: options.writeChunk,
        })

        return nextState
    } catch (error) {
        endAgentStep({
            actionType: 'draft_tasklist',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : '任务清单草稿生成失败。',
            partId: step.partId,
            severity: 'error',
            state: options.initialState,
            status: 'failed',
            stepIndex,
            title: '生成任务清单草稿 v1',
            writeChunk: options.writeChunk,
        })
        throw error
    }
}

function runWarningDispositionStep(options: {
    result: TasklistValidationResult
    state: VersionPlanTasklistAgentState
    writeChunk: WriteChunk
}) {
    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'decide_warning_disposition',
        state: options.state,
        stepIndex,
        title: '判断 warning 处理方式',
        writeChunk: options.writeChunk,
    })
    const disposition = decideWarningDisposition(options.result)
    const nextState = applyVersionPlanTasklistAgentAction(options.state, {
        type: 'decide_warning_disposition',
        disposition,
        reason: disposition.reason,
    })

    endAgentStep({
        actionType: 'decide_warning_disposition',
        durationStartedAt: step.startedAt,
        partId: step.partId,
        severity: disposition.fixNow.length > 0 || disposition.manualReviewItems.length > 0 ? 'warning' : 'info',
        state: nextState,
        stepIndex,
        summary: disposition.reason,
        tags: [`fixNow: ${disposition.fixNow.length}`, `manualReview: ${disposition.manualReviewItems.length}`],
        title: '判断 warning 处理方式',
        writeChunk: options.writeChunk,
    })

    return {
        disposition,
        state: nextState,
    }
}

function runRevisionEffectStep(options: { state: VersionPlanTasklistAgentState; writeChunk: WriteChunk }) {
    const draft = options.state.artifacts.tasklistDraft
    const validationBefore = draft?.validationV1
    const validationAfter = draft?.validationV2 ?? validationBefore

    if (!validationBefore || !validationAfter) {
        throw new Error('缺少 v1 / v2 结构校验结果，无法评估修正效果。')
    }

    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'evaluate_revision_effect',
        state: options.state,
        stepIndex,
        title: '评估修正效果',
        writeChunk: options.writeChunk,
    })
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

    endAgentStep({
        actionType: 'evaluate_revision_effect',
        durationStartedAt: step.startedAt,
        partId: step.partId,
        severity:
            effect.finalDecision === 'blocked' ? 'error' : effect.finalDecision === 'final_with_manual_review_items' ? 'warning' : 'info',
        state: nextState,
        stepIndex,
        summary: `评分 ${effect.scoreBefore} -> ${effect.scoreAfter}，${effect.improved ? '修正有效' : '未观察到评分提升'}。`,
        tags: [`improved: ${effect.improved}`, `decision: ${effect.finalDecision}`, `remaining: ${effect.remainingIssues.length}`],
        title: '评估修正效果',
        writeChunk: options.writeChunk,
    })

    return nextState
}

async function runReviseTasklistStep(options: RunVersionPlanTasklistAgentOptions & { state: VersionPlanTasklistAgentState }) {
    const draft = options.state.artifacts.tasklistDraft
    const validationResult = draft?.validationV1
    const warningDisposition = options.state.artifacts.planning.warningDisposition

    if (!draft || !validationResult || !warningDisposition) {
        throw new Error('缺少 v1 草稿、校验结果或 warning disposition，无法执行自动修正。')
    }

    const stepIndex = getNextStepIndex(options.state)
    const step = startAgentStep({
        actionType: 'revise_tasklist',
        state: options.state,
        stepIndex,
        title: '自动修正任务清单草稿 v2',
        writeChunk: options.writeChunk,
    })

    try {
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

        endAgentStep({
            actionType: 'revise_tasklist',
            durationStartedAt: step.startedAt,
            partId: step.partId,
            state: nextState,
            stepIndex,
            summary: `已生成任务清单草稿 v2，长度 ${revisedDraftText.length} 字符。`,
            tags: [`revision: ${nextState.counters.draftRevisions}`],
            title: '自动修正任务清单草稿 v2',
            writeChunk: options.writeChunk,
        })

        return nextState
    } catch (error) {
        endAgentStep({
            actionType: 'revise_tasklist',
            durationStartedAt: step.startedAt,
            error: error instanceof Error ? error.message : '任务清单自动修正失败。',
            partId: step.partId,
            severity: 'error',
            state: options.state,
            status: 'failed',
            stepIndex,
            title: '自动修正任务清单草稿 v2',
            writeChunk: options.writeChunk,
        })
        throw error
    }
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
            initialState: state,
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
                initialState: state,
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
            initialState: state,
            state,
            strategy: planningDecision.output.strategy,
        })
    }
    state = await runDraftTasklistStep({
        ...options,
        initialState: state,
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
            initialState: state,
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
