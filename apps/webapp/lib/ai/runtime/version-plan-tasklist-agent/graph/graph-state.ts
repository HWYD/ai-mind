import { Annotation } from '@langchain/langgraph'

import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { VersionPlanTasklistAgentState } from '../contract/types'
import type { VersionPlanTasklistGraphNodeId } from './graph-node-ids'

export interface VersionPlanTasklistGraphInput {
    planUri: string
    userGoal: string
}

export interface VersionPlanTasklistGraphRoute {
    fromNodeId: string
    label: string
    reason?: string
    toNodeId: string
}

export interface VersionPlanTasklistGraphStatePatchSummary {
    nodeId: string
    summary: string
}

export interface VersionPlanTasklistGraphRuntimeState {
    checkpointMode: TasklistAgentRuntimeConfig['graphCheckpointMode']
    currentNode?: string
    lastRoute?: VersionPlanTasklistGraphRoute
    routes: VersionPlanTasklistGraphRoute[]
    runtimeMode: 'graph'
    // 这里只保存可展示的状态变化摘要，不写入完整 prompt、资源正文、草稿正文或 tool output。
    statePatchSummaries: VersionPlanTasklistGraphStatePatchSummary[]
    visitedNodes: string[]
}

export interface VersionPlanTasklistGraphOutput {
    errorMessage?: string
    status: 'failed' | 'final' | 'stopped'
    textSummary?: string
}

export interface VersionPlanTasklistGraphState {
    // GraphState 只包裹现有 AgentState；业务事实源仍然由受控状态机维护。
    agentState: VersionPlanTasklistAgentState
    graph: VersionPlanTasklistGraphRuntimeState
    input: VersionPlanTasklistGraphInput
    output?: VersionPlanTasklistGraphOutput
    threadId: string
}

export type VersionPlanTasklistGraphRuntimeStateUpdate = Partial<Omit<VersionPlanTasklistGraphRuntimeState, 'runtimeMode'>> & {
    runtimeMode?: 'graph'
}

function replaceGraphValue<T>(_left: T, right: T): T {
    return right
}

export function buildVersionPlanTasklistGraphThreadId(options: { conversationId: string; runId: string }) {
    return `tasklist-agent:${options.conversationId}:${options.runId}`
}

export function createInitialVersionPlanTasklistGraphRuntimeState(
    checkpointMode: TasklistAgentRuntimeConfig['graphCheckpointMode'] = 'off'
): VersionPlanTasklistGraphRuntimeState {
    return {
        checkpointMode,
        routes: [],
        runtimeMode: 'graph',
        statePatchSummaries: [],
        visitedNodes: [],
    }
}

export function createInitialVersionPlanTasklistGraphState(options: {
    agentState: VersionPlanTasklistAgentState
    conversationId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
}): VersionPlanTasklistGraphState {
    // threadId 只服务 graph/checkpoint 调试，不改变既有 conversation 数据模型。
    return {
        agentState: options.agentState,
        graph: createInitialVersionPlanTasklistGraphRuntimeState(options.runtimeConfig.graphCheckpointMode),
        input: {
            planUri: options.agentState.versionPlanReference.uri,
            userGoal: options.userGoal,
        },
        threadId: buildVersionPlanTasklistGraphThreadId({
            conversationId: options.conversationId,
            runId: options.agentState.runId,
        }),
    }
}

export function reduceVersionPlanTasklistGraphRuntimeState(
    left: VersionPlanTasklistGraphRuntimeState,
    right: VersionPlanTasklistGraphRuntimeStateUpdate
): VersionPlanTasklistGraphRuntimeState {
    // LangGraph node 返回 partial update；标量使用最新值，轨迹数组必须累加，避免节点历史被覆盖。
    return {
        checkpointMode: right.checkpointMode ?? left.checkpointMode,
        currentNode: right.currentNode ?? left.currentNode,
        lastRoute: right.lastRoute ?? left.lastRoute,
        routes: [...left.routes, ...(right.routes ?? [])],
        runtimeMode: 'graph',
        statePatchSummaries: [...left.statePatchSummaries, ...(right.statePatchSummaries ?? [])],
        visitedNodes: [...left.visitedNodes, ...(right.visitedNodes ?? [])],
    }
}

export function createGraphNodeRuntimeUpdate(options: {
    nodeId: VersionPlanTasklistGraphNodeId
    summary: string
}): VersionPlanTasklistGraphRuntimeStateUpdate {
    return {
        currentNode: options.nodeId,
        statePatchSummaries: [
            {
                nodeId: options.nodeId,
                summary: options.summary,
            },
        ],
        visitedNodes: [options.nodeId],
    }
}

export function createGraphRouteRuntimeUpdate(route: VersionPlanTasklistGraphRoute): VersionPlanTasklistGraphRuntimeStateUpdate {
    return {
        lastRoute: route,
        routes: [route],
    }
}

// GraphState 只定义 LangGraph 如何合并 node 返回的 partial update。
// agentState 仍是受控 AgentState 业务事实源，node 返回新状态时直接替换，避免 graph 层维护第二套业务规则。
// graph 只记录编排轨迹和脱敏摘要，reducer 会合并 partial update，并追加 visitedNodes、routes 等轨迹数组。
// input 是本轮固定输入快照，后续 node 不应改写用户目标或显式引用的 version plan URI。
// output 只保存 runner 需要的最终状态摘要，不承载完整 tasklist、prompt、资源正文或 tool 原始输出。
// threadId 只服务 graph/checkpoint 调试链路，不改变 conversation 数据模型，也不作为普通用户概念暴露。
export const VersionPlanTasklistGraphStateAnnotation = Annotation.Root({
    agentState: Annotation<VersionPlanTasklistAgentState, VersionPlanTasklistAgentState>({
        reducer: replaceGraphValue,
    }),
    graph: Annotation<VersionPlanTasklistGraphRuntimeState, VersionPlanTasklistGraphRuntimeStateUpdate>({
        default: createInitialVersionPlanTasklistGraphRuntimeState,
        reducer: reduceVersionPlanTasklistGraphRuntimeState,
    }),
    input: Annotation<VersionPlanTasklistGraphInput, VersionPlanTasklistGraphInput>({
        reducer: replaceGraphValue,
    }),
    output: Annotation<VersionPlanTasklistGraphOutput | undefined, VersionPlanTasklistGraphOutput | undefined>({
        reducer: replaceGraphValue,
    }),
    threadId: Annotation<string, string>({
        reducer: replaceGraphValue,
    }),
})

export type VersionPlanTasklistGraphStateAnnotationState = typeof VersionPlanTasklistGraphStateAnnotation.State
export type VersionPlanTasklistGraphStateAnnotationUpdate = typeof VersionPlanTasklistGraphStateAnnotation.Update
