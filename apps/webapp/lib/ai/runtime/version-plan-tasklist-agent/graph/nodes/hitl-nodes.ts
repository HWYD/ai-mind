import { interrupt } from '@langchain/langgraph'

import {
    strategyReviewDecisionSchema,
    strategyReviewInterruptPayloadSchema,
    tasklistRevisionReviewDecisionSchema,
    tasklistRevisionReviewInterruptPayloadSchema,
} from '../../contract/hitl-review-schema'
import { applyVersionPlanTasklistGraphAction } from '../../state/state-machine'
import { getRouteAfterStrategyReview } from '../edges/route-after-strategy-review'
import { getRouteAfterTasklistRevisionReview } from '../edges/route-after-tasklist-revision-review'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    createGraphNodeRuntimeUpdate,
    createGraphRouteRuntimeUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStatePatch,
} from '../graph-state'

function getStrategyReviewSummary(decisionType: string) {
    switch (decisionType) {
        case 'approve':
            return 'Strategy Review：用户已确认策略。'
        case 'edit':
            return 'Strategy Review：用户已编辑策略。'
        case 'reject':
            return 'Strategy Review：用户已拒绝策略，本轮停止。'
        case 'respond':
            return 'Strategy Review：用户补充反馈，将重新生成策略。'
        default:
            return 'Strategy Review：用户决策已处理。'
    }
}

function getTasklistRevisionReviewSummary(decisionType: string) {
    switch (decisionType) {
        case 'approve':
            return 'Tasklist Revision Review：用户已授权模型修订。'
        case 'edit':
            return 'Tasklist Revision Review：用户已直接编辑 tasklist markdown。'
        case 'reject':
            return 'Tasklist Revision Review：用户已拒绝继续修订，本轮停止。'
        case 'respond':
            return 'Tasklist Revision Review：用户补充修订反馈，将进入一次受控模型修订。'
        default:
            return 'Tasklist Revision Review：用户决策已处理。'
    }
}

function createStrategyReviewInterruptPayload(state: VersionPlanTasklistGraphStateAnnotationState) {
    const strategy = state.planning.strategy

    if (!strategy) {
        throw new Error('Missing tasklist strategy for review.')
    }

    const reviewRound = state.execution.counters.strategyRegenerations > 0 ? 2 : 1
    const payload =
        reviewRound === 1
            ? {
                  allowedDecisions: ['approve', 'edit', 'reject', 'respond'] as const,
                  data: {
                      planUri: state.source.versionPlan?.uri ?? state.source.versionPlanReference.uri,
                      reviewRound,
                      strategy,
                      targetVersion: state.source.versionPlan?.extract?.targetVersion,
                  },
                  kind: 'strategy_review' as const,
                  nodeName: 'reviewTasklistStrategy' as const,
                  runId: state.execution.runId,
                  threadId: state.threadId,
              }
            : {
                  allowedDecisions: ['approve', 'edit', 'reject'] as const,
                  data: {
                      planUri: state.source.versionPlan?.uri ?? state.source.versionPlanReference.uri,
                      reviewRound,
                      strategy,
                      targetVersion: state.source.versionPlan?.extract?.targetVersion,
                  },
                  kind: 'strategy_review' as const,
                  nodeName: 'reviewTasklistStrategy' as const,
                  runId: state.execution.runId,
                  threadId: state.threadId,
              }

    return strategyReviewInterruptPayloadSchema.parse(payload)
}

function createTasklistRevisionReviewInterruptPayload(state: VersionPlanTasklistGraphStateAnnotationState) {
    const draft = state.tasklist.draft
    const validation = draft?.validationV1
    const fixNow = state.planning.warningDisposition?.fixNow ?? []

    if (!draft || draft.version !== 1 || !validation || fixNow.length === 0) {
        throw new Error('Missing v1 tasklist revision review payload dependencies.')
    }

    return tasklistRevisionReviewInterruptPayloadSchema.parse({
        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
        data: {
            fixNow,
            markdown: draft.content,
            reviewRound: 1,
            revision: 1,
            validation: {
                blockingIssues: validation.blockingIssues,
                score: validation.score,
                status: validation.status,
                weakSections: validation.weakSections,
            },
        },
        kind: 'tasklist_revision_review',
        nodeName: 'reviewTasklistRevision',
        runId: state.execution.runId,
        threadId: state.threadId,
    })
}

export function createReviewTasklistStrategyNode() {
    return function reviewTasklistStrategyNode(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphStatePatch {
        const payload = createStrategyReviewInterruptPayload(state)
        const decision = interrupt(payload)
        const parsedDecision = strategyReviewDecisionSchema.safeParse(decision)

        if (!parsedDecision.success) {
            throw new Error('Invalid StrategyReviewDecision.')
        }

        const update = applyVersionPlanTasklistGraphAction(state, {
            decision: parsedDecision.data,
            reason: getStrategyReviewSummary(parsedDecision.data.type),
            type: 'apply_strategy_review_decision',
        })
        const output =
            parsedDecision.data.type === 'reject'
                ? {
                      status: 'stopped' as const,
                      textSummary: parsedDecision.data.reason ?? '用户拒绝当前任务清单拆分策略，本轮 Agent 已停止。',
                  }
                : undefined
        const nextState = applyVersionPlanTasklistGraphStateUpdate(state, {
            ...update,
            output,
        })
        const route = getRouteAfterStrategyReview(nextState)

        return {
            ...update,
            output,
            graph: {
                ...createGraphNodeRuntimeUpdate({
                    nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
                    summary: getStrategyReviewSummary(parsedDecision.data.type),
                }),
                ...createGraphRouteRuntimeUpdate(route),
            },
        }
    }
}

export function createReviewTasklistRevisionNode() {
    return function reviewTasklistRevisionNode(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphStatePatch {
        const payload = createTasklistRevisionReviewInterruptPayload(state)
        const decision = interrupt(payload)
        const parsedDecision = tasklistRevisionReviewDecisionSchema.safeParse(decision)

        if (!parsedDecision.success) {
            throw new Error('Invalid TasklistRevisionReviewDecision.')
        }

        const update = applyVersionPlanTasklistGraphAction(state, {
            decision: parsedDecision.data,
            reason: getTasklistRevisionReviewSummary(parsedDecision.data.type),
            type: 'apply_tasklist_revision_review_decision',
        })
        const output =
            parsedDecision.data.type === 'reject'
                ? {
                      status: 'stopped' as const,
                      textSummary: parsedDecision.data.reason ?? '用户拒绝继续修订当前 tasklist draft，本轮 Agent 已停止。',
                  }
                : undefined
        const nextState = applyVersionPlanTasklistGraphStateUpdate(state, {
            ...update,
            output,
        })
        const route = getRouteAfterTasklistRevisionReview(nextState)

        return {
            ...update,
            output,
            graph: {
                ...createGraphNodeRuntimeUpdate({
                    nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
                    summary: getTasklistRevisionReviewSummary(parsedDecision.data.type),
                }),
                ...createGraphRouteRuntimeUpdate(route),
            },
        }
    }
}
