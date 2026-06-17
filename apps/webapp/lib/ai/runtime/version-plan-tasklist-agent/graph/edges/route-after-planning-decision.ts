import { END } from '@langchain/langgraph'

import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type PlanningDecisionRouteTarget =
    | typeof END
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.askClarification
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.stopWithBoundaryMessage

export function getRouteAfterPlanningDecision(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    if (state.output?.status === 'stopped') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
            label: 'controlled_output_failed',
            reason: state.output.textSummary ?? '规划决策输出不符合受控 JSON schema，本轮已安全停止。',
            toNodeId: END,
        }
    }

    const decision = state.planning.decision

    if (!decision) {
        throw new Error('缺少 PlanningDecisionAction，无法决定 graph 下一跳。')
    }

    switch (decision.type) {
        case 'ask_clarification':
            return {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                label: decision.type,
                reason: decision.reason,
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.askClarification,
            }
        case 'stop_with_boundary_message':
            return {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                label: decision.type,
                reason: decision.reason,
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.stopWithBoundaryMessage,
            }
        case 'read_optional_context':
            return {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                label: decision.type,
                reason: decision.reason,
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext,
            }
        case 'proceed_to_tasklist_strategy':
        case 'proceed_with_manual_review_items':
            return {
                fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                label: decision.type,
                reason: decision.reason,
                toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            }
        default:
            throw new Error('未知 PlanningDecisionAction，graph 已拒绝继续路由。')
    }
}

export function routeAfterPlanningDecision(state: VersionPlanTasklistGraphStateAnnotationState): PlanningDecisionRouteTarget {
    return getRouteAfterPlanningDecision(state).toNodeId as PlanningDecisionRouteTarget
}
