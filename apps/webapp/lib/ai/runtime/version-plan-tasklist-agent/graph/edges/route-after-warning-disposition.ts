import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type WarningDispositionRouteTarget =
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3

export function getRouteAfterWarningDisposition(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    const disposition = state.planning.warningDisposition

    if (!disposition) {
        throw new Error('缺少 WarningDisposition，无法决定 graph 下一步。')
    }

    if (disposition.fixNow.length === 0) {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            label: 'no_auto_revision',
            reason: disposition.reason,
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
        }
    }

    const draftVersion = state.tasklist.draft?.version

    if (!draftVersion) {
        throw new Error('缺少 tasklist draft，无法决定 warning disposition 路由。')
    }

    if (draftVersion === 1 && !state.human.tasklistRevisionReview) {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            label: 'fix_now_review_required',
            reason: disposition.reason,
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
        }
    }

    if (draftVersion < 3 && state.execution.counters.draftRevisions < state.execution.limits.maxDraftRevisions) {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            label: draftVersion === 1 ? 'fix_now' : 'fix_now_auto_revision',
            reason: disposition.reason,
            toNodeId:
                draftVersion === 1
                    ? VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2
                    : VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3,
        }
    }

    return {
        fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
        label: 'revision_budget_exhausted',
        reason: disposition.reason,
        toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
    }
}

export function routeAfterWarningDisposition(state: VersionPlanTasklistGraphStateAnnotationState): WarningDispositionRouteTarget {
    return getRouteAfterWarningDisposition(state).toNodeId as WarningDispositionRouteTarget
}
