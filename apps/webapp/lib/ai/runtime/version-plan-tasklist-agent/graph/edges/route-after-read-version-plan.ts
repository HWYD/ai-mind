import { END } from '@langchain/langgraph'

import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type ReadVersionPlanRouteTarget = typeof END | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness

export function getRouteAfterReadVersionPlan(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    if (state.output?.status === 'failed') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            label: 'read_failed',
            reason: state.output.textSummary ?? state.output.errorMessage ?? '版本方案读取失败。',
            toNodeId: END,
        }
    }

    if (state.source.versionPlan?.uri === state.source.versionPlanReference.uri) {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            label: 'read_succeeded',
            reason: '版本方案读取成功，继续进入 readiness 检查。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
        }
    }

    throw new Error('readVersionPlan 未产生可路由状态，graph 已拒绝继续。')
}

export function routeAfterReadVersionPlan(state: VersionPlanTasklistGraphStateAnnotationState): ReadVersionPlanRouteTarget {
    return getRouteAfterReadVersionPlan(state).toNodeId as ReadVersionPlanRouteTarget
}
