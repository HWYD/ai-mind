import type { AgentStepSeverity, AgentStepStatus } from '@ai-mind/stream-core/protocol'
import { isGraphInterrupt } from '@langchain/langgraph'

import { createId } from '@/lib/ai/create-id'

import type { WriteChunk } from '../../types'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS, type VersionPlanTasklistGraphNodeId } from './graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from './graph-node-runtime'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    type VersionPlanTasklistGraphRoute,
    type VersionPlanTasklistGraphRuntimeStateUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStatePatch,
} from './graph-state'

export type GraphNodeHandler = (
    state: VersionPlanTasklistGraphStateAnnotationState
) => Promise<VersionPlanTasklistGraphStatePatch> | VersionPlanTasklistGraphStatePatch

interface GraphEventBase {
    agentName: string
    runId: string
    threadId: string
}

interface EmitGraphNodeStartOptions extends GraphEventBase {
    nodeId: string
    partId: string
    stepIndex: number
    title: string
}

interface EmitGraphNodeEndOptions extends GraphEventBase {
    durationMs?: number
    error?: string
    nodeId: string
    partId: string
    severity?: AgentStepSeverity
    status: Exclude<AgentStepStatus, 'running'>
    summary?: string
    tags?: string[]
}

interface EmitGraphRouteOptions extends GraphEventBase {
    route: VersionPlanTasklistGraphRoute
}

interface EmitGraphStatePatchOptions extends GraphEventBase {
    nodeId: string
    patchSummary: string
}

interface GraphNodeResultDisplay {
    severity?: AgentStepSeverity
    status: Exclude<AgentStepStatus, 'running'>
    tags?: string[]
}

const GRAPH_NODE_TITLES: Record<VersionPlanTasklistGraphNodeId, string> = {
    askClarification: '输出澄清问题',
    decideTasklistStrategy: '决定任务清单策略',
    decideWarningDisposition: '决定 warning 处理',
    draftTasklistV1: '生成 v1 草稿',
    emitFinalArtifact: '输出最终产物',
    evaluatePlanReadiness: '评估方案完整性',
    evaluateRevisionEffect: '评估修正效果',
    planningDecision: '规划决策',
    readOptionalContext: '读取补充上下文',
    readVersionPlan: '读取版本方案',
    regenerateTasklistStrategy: '重新生成任务清单策略',
    reviewTasklistRevision: '审核任务清单修订',
    reviewTasklistStrategy: '审核任务清单策略',
    reviseTasklistV2: '修正 v2 草稿',
    reviseTasklistV3: '修正 v3 草稿',
    stopWithBoundaryMessage: '输出边界停止提示',
    validateTasklistV1: '校验 v1 草稿',
    validateTasklistV2: '校验 v2 草稿',
    validateTasklistV3: '校验 v3 草稿',
}

// 将内部 nodeId 映射成用户可读的中文标题，后续 Trace UI 不需要认识每个内部 id。
export function getGraphNodeTitle(nodeId: VersionPlanTasklistGraphNodeId) {
    return GRAPH_NODE_TITLES[nodeId]
}

// 每个 graph event 都需要带上本轮 Agent 的最小定位信息；这里不返回完整 AgentState。
function getGraphEventBase(state: VersionPlanTasklistGraphStateAnnotationState): GraphEventBase {
    return {
        agentName: state.execution.agentName,
        runId: state.execution.runId,
        threadId: state.threadId,
    }
}

// graph node 失败时只输出一段短错误，避免把 stack、prompt 或内部状态带进前端 stream。
function sanitizeGraphError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Graph node failed.'

    return message.replace(/\s+/g, ' ').trim().slice(0, 240) || 'Graph node failed.'
}

// 发送“某个 graph node 开始执行”的事件。它只描述执行位置，不承载业务数据。
export function emitGraphNodeStart(writeChunk: WriteChunk, options: EmitGraphNodeStartOptions) {
    writeChunk({
        agentName: options.agentName,
        nodeId: options.nodeId,
        partId: options.partId,
        runId: options.runId,
        stepIndex: options.stepIndex,
        threadId: options.threadId,
        title: options.title,
        type: 'agent-graph-node-start',
    })
}

// 发送“某个 graph node 执行结束”的事件，包含状态、耗时、摘要和可选错误。
export function emitGraphNodeEnd(writeChunk: WriteChunk, options: EmitGraphNodeEndOptions) {
    writeChunk({
        agentName: options.agentName,
        durationMs: options.durationMs,
        error: options.error,
        nodeId: options.nodeId,
        partId: options.partId,
        runId: options.runId,
        severity: options.severity,
        status: options.status,
        summary: options.summary,
        tags: options.tags,
        threadId: options.threadId,
        type: 'agent-graph-node-end',
    })
}

// 发送 conditional edge 的路由结果，让前端知道 graph 为什么从 A 走到 B。
export function emitGraphRoute(writeChunk: WriteChunk, options: EmitGraphRouteOptions) {
    writeChunk({
        agentName: options.agentName,
        fromNodeId: options.route.fromNodeId,
        partId: createId(),
        reason: options.route.reason,
        routeLabel: options.route.label,
        runId: options.runId,
        threadId: options.threadId,
        toNodeId: options.route.toNodeId,
        type: 'agent-graph-route',
    })
}

// 发送状态变化摘要。注意这里只允许 patchSummary 字符串，不发送完整 GraphState / AgentState。
export function emitGraphStatePatch(writeChunk: WriteChunk, options: EmitGraphStatePatchOptions) {
    writeChunk({
        agentName: options.agentName,
        nodeId: options.nodeId,
        partId: createId(),
        patchSummary: options.patchSummary,
        runId: options.runId,
        threadId: options.threadId,
        type: 'agent-graph-state-patch',
    })
}

// 从 node 返回的 LangGraph partial update 里取出我们自己维护的 graph runtime 摘要。
// 这里不会读取完整业务 state，只消费 routes 和 statePatchSummaries 这两类可展示轨迹。
function getGraphRuntimeUpdate(update: VersionPlanTasklistGraphStatePatch): VersionPlanTasklistGraphRuntimeStateUpdate | undefined {
    const graphUpdate = update.graph

    if (!graphUpdate || typeof graphUpdate !== 'object') {
        return undefined
    }

    // LangGraph 的 Annotation update 还允许 overwrite wrapper；这里只消费我们节点返回的受控 graph partial update。
    if (!('routes' in graphUpdate) && !('statePatchSummaries' in graphUpdate)) {
        return undefined
    }

    return graphUpdate as VersionPlanTasklistGraphRuntimeStateUpdate
}

// 找出当前 node 对应的 patch summary，用作 node-end 的简短说明。
function getGraphUpdateSummary(update: VersionPlanTasklistGraphStatePatch, nodeId: VersionPlanTasklistGraphNodeId) {
    const statePatchSummaries = getGraphRuntimeUpdate(update)?.statePatchSummaries ?? []

    for (let index = statePatchSummaries.length - 1; index >= 0; index -= 1) {
        const statePatchSummary = statePatchSummaries[index]

        if (statePatchSummary?.nodeId === nodeId) {
            return statePatchSummary.summary
        }
    }

    return undefined
}

function createCompletedGraphNodeResult(severity: AgentStepSeverity = 'info', tags?: string[]): GraphNodeResultDisplay {
    return tags
        ? {
              severity,
              status: 'completed',
              tags,
          }
        : {
              severity,
              status: 'completed',
          }
}

function getValidationSeverity(status?: 'fail' | 'pass' | 'warning'): AgentStepSeverity {
    switch (status) {
        case 'fail':
            return 'error'
        case 'warning':
            return 'warning'
        default:
            return 'info'
    }
}

function getRevisionEffectSeverity(finalDecision?: 'blocked' | 'final' | 'final_with_manual_review_items'): AgentStepSeverity {
    switch (finalDecision) {
        case 'blocked':
            return 'error'
        case 'final_with_manual_review_items':
            return 'warning'
        default:
            return 'info'
    }
}

function getGraphNodeResultDisplay(
    nodeId: VersionPlanTasklistGraphNodeId,
    nextState: VersionPlanTasklistGraphStateAnnotationState
): GraphNodeResultDisplay {
    const outputStatus = nextState.output?.status

    if (outputStatus === 'failed') {
        return {
            severity: 'error',
            status: 'failed',
        }
    }

    if (outputStatus === 'stopped') {
        return createCompletedGraphNodeResult('warning', ['status: stopped'])
    }

    switch (nodeId) {
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness: {
            const readinessStatus = nextState.planning.readiness?.status

            if (readinessStatus === 'blocked' || readinessStatus === 'needs_review') {
                return createCompletedGraphNodeResult('warning')
            }

            return createCompletedGraphNodeResult()
        }
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision:
            return createCompletedGraphNodeResult(
                nextState.planning.decision?.type === 'proceed_with_manual_review_items' ? 'warning' : 'info'
            )
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext:
            return createCompletedGraphNodeResult(nextState.planning.optionalContext?.status === 'failed' ? 'warning' : 'info')
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV1:
            return createCompletedGraphNodeResult(getValidationSeverity(nextState.tasklist.draft?.validationV1?.status))
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2:
            return createCompletedGraphNodeResult(getValidationSeverity(nextState.tasklist.draft?.validationV2?.status))
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV3:
            return createCompletedGraphNodeResult(getValidationSeverity(nextState.tasklist.draft?.validationV3?.status))
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition: {
            const warningDisposition = nextState.planning.warningDisposition
            const hasWarnings = (warningDisposition?.fixNow.length ?? 0) > 0 || (warningDisposition?.manualReviewItems.length ?? 0) > 0

            return createCompletedGraphNodeResult(hasWarnings ? 'warning' : 'info')
        }
        case VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect:
            return createCompletedGraphNodeResult(getRevisionEffectSeverity(nextState.planning.revisionEffect?.finalDecision))
        default:
            return createCompletedGraphNodeResult()
    }
}

// 给 graph node 套一层事件包装：
// - events 关闭时直接返回原 node，保证 graph runner 行为不变。
// - events 开启时发送 node start/end、route 和 state patch summary。
// - node 失败时发送 failed node end，然后继续抛错，不吞掉运行时失败。
export function withGraphNodeEvents(
    nodeId: VersionPlanTasklistGraphNodeId,
    node: GraphNodeHandler,
    runtime: VersionPlanTasklistGraphNodeRuntime
): GraphNodeHandler {
    if (!runtime.runtimeConfig.graphEventsEnabled) {
        return node
    }

    return async function graphNodeWithEvents(state) {
        const eventBase = getGraphEventBase(state)
        const nodePartId = createId()
        const startedAt = Date.now()

        emitGraphNodeStart(runtime.writeChunk, {
            ...eventBase,
            nodeId,
            partId: nodePartId,
            stepIndex: state.graph.visitedNodes.length + 1,
            title: getGraphNodeTitle(nodeId),
        })

        try {
            const update = await node(state)
            const graphUpdate = getGraphRuntimeUpdate(update)
            const nextState = applyVersionPlanTasklistGraphStateUpdate(state, update)
            const summary = getGraphUpdateSummary(update, nodeId)
            const resultDisplay = getGraphNodeResultDisplay(nodeId, nextState)

            for (const statePatch of graphUpdate?.statePatchSummaries ?? []) {
                emitGraphStatePatch(runtime.writeChunk, {
                    ...eventBase,
                    nodeId: statePatch.nodeId,
                    patchSummary: statePatch.summary,
                })
            }

            for (const route of graphUpdate?.routes ?? []) {
                emitGraphRoute(runtime.writeChunk, {
                    ...eventBase,
                    route,
                })
            }

            emitGraphNodeEnd(runtime.writeChunk, {
                ...eventBase,
                durationMs: Date.now() - startedAt,
                nodeId,
                partId: nodePartId,
                severity: resultDisplay.severity,
                status: resultDisplay.status,
                summary,
                tags: resultDisplay.tags,
            })

            return update
        } catch (error) {
            if (isGraphInterrupt(error)) {
                emitGraphNodeEnd(runtime.writeChunk, {
                    ...eventBase,
                    durationMs: Date.now() - startedAt,
                    nodeId,
                    partId: nodePartId,
                    severity: 'info',
                    status: 'skipped',
                    summary: 'Graph 已暂停，等待人工审核后 resume。',
                    tags: ['status: interrupted'],
                })

                throw error
            }

            emitGraphNodeEnd(runtime.writeChunk, {
                ...eventBase,
                durationMs: Date.now() - startedAt,
                error: sanitizeGraphError(error),
                nodeId,
                partId: nodePartId,
                severity: 'error',
                status: 'failed',
            })

            throw error
        }
    }
}
