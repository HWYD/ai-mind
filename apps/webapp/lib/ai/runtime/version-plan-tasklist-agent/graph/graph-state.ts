import { Annotation } from '@langchain/langgraph'

import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type {
    VersionPlanTasklistAgentState,
    VersionPlanTasklistIntermediateArtifacts,
    VersionPlanTasklistPlanningArtifacts,
} from '../contract/types'
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

export interface VersionPlanTasklistGraphSourceState {
    versionPlan?: VersionPlanTasklistIntermediateArtifacts['versionPlan']
    versionPlanReference: VersionPlanTasklistAgentState['versionPlanReference']
}

export type VersionPlanTasklistGraphPlanningState = VersionPlanTasklistPlanningArtifacts

export interface VersionPlanTasklistGraphTasklistState {
    draft?: VersionPlanTasklistIntermediateArtifacts['tasklistDraft']
}

export interface VersionPlanTasklistGraphExecutionState {
    agentName: VersionPlanTasklistAgentState['agentName']
    counters: VersionPlanTasklistAgentState['counters']
    limits: VersionPlanTasklistAgentState['limits']
    runId: string
    status: VersionPlanTasklistAgentState['status']
}

export type VersionPlanTasklistGraphRuntimeStateUpdate = Partial<Omit<VersionPlanTasklistGraphRuntimeState, 'runtimeMode'>> & {
    runtimeMode?: 'graph'
}

export interface VersionPlanTasklistGraphState {
    execution: VersionPlanTasklistGraphExecutionState
    graph: VersionPlanTasklistGraphRuntimeState
    input: VersionPlanTasklistGraphInput
    output?: VersionPlanTasklistGraphOutput
    planning: VersionPlanTasklistGraphPlanningState
    source: VersionPlanTasklistGraphSourceState
    tasklist: VersionPlanTasklistGraphTasklistState
    threadId: string
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
    const statePatch = createGraphStateUpdateFromAgentState(options.agentState)

    // threadId 只服务 graph/checkpoint 调试，不改变既有 conversation 数据模型。
    return {
        execution: statePatch.execution,
        graph: createInitialVersionPlanTasklistGraphRuntimeState(options.runtimeConfig.graphCheckpointMode),
        input: {
            planUri: options.agentState.versionPlanReference.uri,
            userGoal: options.userGoal,
        },
        planning: statePatch.planning,
        source: statePatch.source,
        tasklist: statePatch.tasklist,
        threadId: buildVersionPlanTasklistGraphThreadId({
            conversationId: options.conversationId,
            runId: options.agentState.runId,
        }),
    }
}

export function createGraphStateUpdateFromAgentState(
    agentState: VersionPlanTasklistAgentState
): Pick<VersionPlanTasklistGraphState, 'execution' | 'planning' | 'source' | 'tasklist'> {
    return {
        execution: {
            agentName: agentState.agentName,
            counters: agentState.counters,
            limits: agentState.limits,
            runId: agentState.runId,
            status: agentState.status,
        },
        planning: agentState.artifacts.planning,
        source: {
            versionPlan: agentState.artifacts.versionPlan,
            versionPlanReference: agentState.versionPlanReference,
        },
        tasklist: {
            draft: agentState.artifacts.tasklistDraft,
        },
    }
}

export function toVersionPlanTasklistAgentState(state: VersionPlanTasklistGraphState): VersionPlanTasklistAgentState {
    return {
        agentName: state.execution.agentName,
        artifacts: {
            planning: state.planning,
            tasklistDraft: state.tasklist.draft,
            versionPlan: state.source.versionPlan,
        },
        counters: state.execution.counters,
        limits: state.execution.limits,
        runId: state.execution.runId,
        status: state.execution.status,
        versionPlanReference: state.source.versionPlanReference,
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
// 领域状态机仍通过临时 VersionPlanTasklistAgentState 适配复用，避免 graph 层复制业务规则。
// graph 只记录编排轨迹和脱敏摘要，reducer 会合并 partial update，并追加 visitedNodes、routes 等轨迹数组。
// input 是本轮固定输入快照，后续 node 不应改写用户目标或显式引用的 version plan URI。
// output 只保存 runner 需要的最终状态摘要，不承载完整 tasklist、prompt、资源正文或 tool 原始输出。
// threadId 只服务 graph/checkpoint 调试链路，不改变 conversation 数据模型，也不作为普通用户概念暴露。
export const VersionPlanTasklistGraphStateAnnotation = Annotation.Root({
    execution: Annotation<VersionPlanTasklistGraphExecutionState, VersionPlanTasklistGraphExecutionState>({
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
    planning: Annotation<VersionPlanTasklistGraphPlanningState, VersionPlanTasklistGraphPlanningState>({
        reducer: replaceGraphValue,
    }),
    source: Annotation<VersionPlanTasklistGraphSourceState, VersionPlanTasklistGraphSourceState>({
        reducer: replaceGraphValue,
    }),
    tasklist: Annotation<VersionPlanTasklistGraphTasklistState, VersionPlanTasklistGraphTasklistState>({
        reducer: replaceGraphValue,
    }),
    threadId: Annotation<string, string>({
        reducer: replaceGraphValue,
    }),
})

export type VersionPlanTasklistGraphStateAnnotationState = typeof VersionPlanTasklistGraphStateAnnotation.State
export type VersionPlanTasklistGraphStateAnnotationUpdate = typeof VersionPlanTasklistGraphStateAnnotation.Update
