import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type WarningDispositionRouteTarget =
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2

export function getRouteAfterWarningDisposition(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    const disposition = state.planning.warningDisposition

    if (!disposition) {
        throw new Error('缺少 WarningDisposition，无法决定 graph 下一跳。')
    }

    const shouldRevise = disposition.fixNow.length > 0

    return {
        fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
        label: shouldRevise ? 'fix_now' : 'no_auto_revision',
        reason: disposition.reason,
        toNodeId: shouldRevise
            ? VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2
            : VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
    }
}

export function routeAfterWarningDisposition(state: VersionPlanTasklistGraphStateAnnotationState): WarningDispositionRouteTarget {
    return getRouteAfterWarningDisposition(state).toNodeId as WarningDispositionRouteTarget
}
