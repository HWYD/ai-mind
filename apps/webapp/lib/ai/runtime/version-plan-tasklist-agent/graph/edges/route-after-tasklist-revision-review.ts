import { END } from '@langchain/langgraph'

import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type TasklistRevisionReviewRouteTarget =
    | typeof END
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2
    | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2

export function getRouteAfterTasklistRevisionReview(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    const decision = state.human.tasklistRevisionReview?.decision

    if (state.execution.status === 'tasklist_revision_reviewed') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
            label: decision?.type === 'respond' ? 'tasklist_revision_feedback_received' : 'tasklist_revision_approved',
            reason:
                decision?.type === 'respond'
                    ? '用户补充了 tasklist 修订反馈，进入一次受控模型修订。'
                    : '用户已授权对当前 tasklist draft 执行一次受控模型修订。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
        }
    }

    if (state.execution.status === 'revised_v2' && decision?.type === 'edit') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
            label: 'tasklist_revision_edited',
            reason: '用户已直接编辑 tasklist markdown，跳过模型修订并重新校验 v2。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2,
        }
    }

    if (state.execution.status === 'stopped' && decision?.type === 'reject') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
            label: 'tasklist_revision_rejected',
            reason: state.output?.textSummary ?? '用户拒绝继续修订当前 tasklist draft，本轮 Agent 停止。',
            toNodeId: END,
        }
    }

    throw new Error('Tasklist Revision Review 未产生可路由状态，graph 已拒绝继续。')
}

export function routeAfterTasklistRevisionReview(state: VersionPlanTasklistGraphStateAnnotationState): TasklistRevisionReviewRouteTarget {
    return getRouteAfterTasklistRevisionReview(state).toNodeId as TasklistRevisionReviewRouteTarget
}
