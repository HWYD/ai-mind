import {
    runDraftTasklistStep,
    runReviseTasklistStep,
    runRevisionEffectStep,
    runWarningDispositionStep,
} from '../../steps/tasklist-agent-steps'
import { runValidateTasklistStep } from '../../tasklist/tasklist-agent-validation'
import { getRouteAfterWarningDisposition } from '../edges/route-after-warning-disposition'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from '../graph-node-runtime'
import {
    createGraphNodeRuntimeUpdate,
    createGraphRouteRuntimeUpdate,
    createGraphStateUpdateFromAgentState,
    toVersionPlanTasklistAgentState,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStateAnnotationUpdate,
} from '../graph-state'

export function createDraftTasklistV1Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function draftTasklistV1Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const agentState = toVersionPlanTasklistAgentState(state)
        const nextAgentState = await runDraftTasklistStep({
            context: runtime.context,
            model: runtime.model,
            state: agentState,
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...createGraphStateUpdateFromAgentState(nextAgentState),
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
                summary: `已生成任务清单草稿 v${nextAgentState.artifacts.tasklistDraft?.version ?? 1}。`,
            }),
        }
    }
}

export function createValidateTasklistV1Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function validateTasklistV1Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const agentState = toVersionPlanTasklistAgentState(state)
        const result = await runValidateTasklistStep({
            context: runtime.context,
            state: agentState,
            title: '校验任务清单结构 v1',
            writeChunk: runtime.writeChunk,
        })

        return {
            ...createGraphStateUpdateFromAgentState(result.state),
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV1,
                summary: `v1 结构校验：${result.result.status}，评分 ${result.result.score}。`,
            }),
        }
    }
}

export function createDecideWarningDispositionNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function decideWarningDispositionNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const agentState = toVersionPlanTasklistAgentState(state)
        const validationResult = agentState.artifacts.tasklistDraft?.validationV1

        if (!validationResult) {
            throw new Error('缺少 v1 结构校验结果，无法判断 warning 处理方式。')
        }

        const result = runWarningDispositionStep({
            result: validationResult,
            state: agentState,
            writeChunk: runtime.writeChunk,
        })
        const nextState = {
            ...state,
            ...createGraphStateUpdateFromAgentState(result.state),
        }
        const route = getRouteAfterWarningDisposition(nextState)

        return {
            ...createGraphStateUpdateFromAgentState(result.state),
            graph: {
                ...createGraphNodeRuntimeUpdate({
                    nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
                    summary: `warning 处理：fixNow ${result.disposition.fixNow.length}，manualReview ${result.disposition.manualReviewItems.length}。`,
                }),
                ...createGraphRouteRuntimeUpdate(route),
            },
        }
    }
}

export function createReviseTasklistV2Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function reviseTasklistV2Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const agentState = toVersionPlanTasklistAgentState(state)
        const nextAgentState = await runReviseTasklistStep({
            context: runtime.context,
            model: runtime.model,
            state: agentState,
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...createGraphStateUpdateFromAgentState(nextAgentState),
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
                summary: `已执行自动修正 ${nextAgentState.counters.draftRevisions} 次。`,
            }),
        }
    }
}

export function createValidateTasklistV2Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function validateTasklistV2Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const agentState = toVersionPlanTasklistAgentState(state)
        const result = await runValidateTasklistStep({
            context: runtime.context,
            state: agentState,
            title: '再次校验任务清单结构 v2',
            writeChunk: runtime.writeChunk,
        })

        return {
            ...createGraphStateUpdateFromAgentState(result.state),
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2,
                summary: `v2 结构校验：${result.result.status}，评分 ${result.result.score}。`,
            }),
        }
    }
}

export function createEvaluateRevisionEffectNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function evaluateRevisionEffectNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const nextAgentState = runRevisionEffectStep({
            state: toVersionPlanTasklistAgentState(state),
            writeChunk: runtime.writeChunk,
        })

        return {
            ...createGraphStateUpdateFromAgentState(nextAgentState),
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
                summary: `修正效果结论：${nextAgentState.artifacts.planning.revisionEffect?.finalDecision ?? 'unknown'}。`,
            }),
        }
    }
}
