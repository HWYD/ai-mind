import { END } from '@langchain/langgraph'

import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphRoute, VersionPlanTasklistGraphStateAnnotationState } from '../graph-state'

export type TasklistStrategyRouteTarget = typeof END | typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1

export function getRouteAfterTasklistStrategy(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphRoute {
    if (state.output?.status === 'stopped') {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            label: 'controlled_output_failed',
            reason: state.output.textSummary ?? '任务清单拆分策略输出不符合受控 JSON schema，本轮已安全停止。',
            toNodeId: END,
        }
    }

    if (state.planning.strategy) {
        return {
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            label: 'strategy_decided',
            reason: '任务清单拆分策略已确定，继续生成 v1 草稿。',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
        }
    }

    throw new Error('TasklistStrategy 未产生可路由状态，graph 已拒绝继续。')
}

export function routeAfterTasklistStrategy(state: VersionPlanTasklistGraphStateAnnotationState): TasklistStrategyRouteTarget {
    return getRouteAfterTasklistStrategy(state).toNodeId as TasklistStrategyRouteTarget
}
