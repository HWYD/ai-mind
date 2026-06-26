import { END } from '@langchain/langgraph'

import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type StrategyReviewRouteTarget =
    | typeof END
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy

export function getRouteAfterStrategyReview(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    const decision = state.human.strategyReview?.decision

    if (state.execution.status === 'strategy_reviewed') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            label: decision?.type === 'edit' ? 'strategy_edited' : 'strategy_approved',
            reason: decision?.type === 'edit' ? '用户已编辑并确认拆分策略。' : '用户已确认拆分策略。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
        }
    }

    if (state.execution.status === 'strategy_feedback_received') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            label: 'strategy_feedback_received',
            reason: '用户补充了 strategy feedback，进入一次受控重新生成。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
        }
    }

    if (state.execution.status === 'stopped' && decision?.type === 'reject') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            label: 'strategy_rejected',
            reason: state.output?.textSummary ?? '用户拒绝当前拆分策略，本轮 Agent 停止。',
            toNodeId: END,
        }
    }

    throw new Error('Strategy Review 未产生可路由状态，graph 已拒绝继续。')
}

export function routeAfterStrategyReview(state: VersionPlanTasklistGraphStateAnnotationState): StrategyReviewRouteTarget {
    return getRouteAfterStrategyReview(state).toNodeId as StrategyReviewRouteTarget
}
