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
    applyVersionPlanTasklistGraphStateUpdate,
    createGraphNodeRuntimeUpdate,
    createGraphRouteRuntimeUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStatePatch,
} from '../graph-state'

function getLatestTasklistValidationResult(state: VersionPlanTasklistGraphStateAnnotationState) {
    const draft = state.tasklist.draft

    return draft?.validationV3 ?? draft?.validationV2 ?? draft?.validationV1
}

export function createDraftTasklistV1Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function draftTasklistV1Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const update = await runDraftTasklistStep({
            context: runtime.context,
            model: runtime.models.drafting.model,
            modelStage: 'tasklist-draft',
            modelTimeoutMs: runtime.models.drafting.timeoutMs,
            state,
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
                summary: `已生成任务清单草稿 v${update.tasklist?.draft?.version ?? 1}。`,
            }),
        }
    }
}

export function createValidateTasklistV1Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function validateTasklistV1Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const result = await runValidateTasklistStep({
            context: runtime.context,
            state,
            title: '校验任务清单结构 v1',
            writeChunk: runtime.writeChunk,
        })

        return {
            ...result.update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV1,
                summary: `v1 结构校验：${result.result.status}，评分 ${result.result.score}。`,
            }),
        }
    }
}

export function createDecideWarningDispositionNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function decideWarningDispositionNode(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphStatePatch {
        const validationResult = getLatestTasklistValidationResult(state)

        if (!validationResult) {
            throw new Error('Missing latest tasklist validation result.')
        }

        const result = runWarningDispositionStep({
            result: validationResult,
            state,
            writeChunk: runtime.writeChunk,
        })
        const route = getRouteAfterWarningDisposition(applyVersionPlanTasklistGraphStateUpdate(state, result.update))

        return {
            ...result.update,
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
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const update = await runReviseTasklistStep({
            context: runtime.context,
            model: runtime.models.drafting.model,
            modelStage: 'tasklist-revision',
            modelTimeoutMs: runtime.models.drafting.timeoutMs,
            state,
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
                summary: `已生成受控修订草稿 v${update.tasklist?.draft?.version ?? 2}。`,
            }),
        }
    }
}

export function createValidateTasklistV2Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function validateTasklistV2Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const result = await runValidateTasklistStep({
            context: runtime.context,
            state,
            title: '再次校验任务清单结构 v2',
            writeChunk: runtime.writeChunk,
        })

        return {
            ...result.update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2,
                summary: `v2 结构校验：${result.result.status}，评分 ${result.result.score}。`,
            }),
        }
    }
}

export function createReviseTasklistV3Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function reviseTasklistV3Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const update = await runReviseTasklistStep({
            context: runtime.context,
            model: runtime.models.drafting.model,
            modelStage: 'tasklist-revision',
            modelTimeoutMs: runtime.models.drafting.timeoutMs,
            state,
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3,
                summary: `已生成第二轮受控修订草稿 v${update.tasklist?.draft?.version ?? 3}。`,
            }),
        }
    }
}

export function createValidateTasklistV3Node(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function validateTasklistV3Node(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const result = await runValidateTasklistStep({
            context: runtime.context,
            state,
            title: '最终校验任务清单结构 v3',
            writeChunk: runtime.writeChunk,
        })

        return {
            ...result.update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV3,
                summary: `v3 结构校验：${result.result.status}，评分 ${result.result.score}。`,
            }),
        }
    }
}

export function createEvaluateRevisionEffectNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function evaluateRevisionEffectNode(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphStatePatch {
        const update = runRevisionEffectStep({
            state,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
                summary: `修订效果结论：${update.planning?.revisionEffect?.finalDecision ?? 'unknown'}。`,
            }),
        }
    }
}
