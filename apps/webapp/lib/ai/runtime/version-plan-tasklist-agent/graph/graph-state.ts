import { Annotation } from '@langchain/langgraph'

import type { ChatComposerReference } from '@/lib/ai/types/chat'

import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { StrategyReviewDecision, TasklistRevisionReviewDecision } from '../contract/hitl-review-schema'
import type {
    VersionPlanTasklistAgentStatus,
    VersionPlanTasklistIntermediateArtifacts,
    VersionPlanTasklistPlanningArtifacts,
} from '../contract/types'
import { VERSION_PLAN_TASKLIST_AGENT_LIMITS, VERSION_PLAN_TASKLIST_AGENT_NAME } from '../contract/types'
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
    versionPlanReference: ChatComposerReference
}

export type VersionPlanTasklistGraphPlanningState = VersionPlanTasklistPlanningArtifacts

export interface VersionPlanTasklistGraphTasklistState {
    draft?: VersionPlanTasklistIntermediateArtifacts['tasklistDraft']
}

export interface VersionPlanTasklistGraphExecutionState {
    agentName: typeof VERSION_PLAN_TASKLIST_AGENT_NAME
    counters: {
        draftRevisions: number
        optionalContextReads: number
        steps: number
        strategyRegenerations: number
    }
    limits: typeof VERSION_PLAN_TASKLIST_AGENT_LIMITS
    runId: string
    status: VersionPlanTasklistAgentStatus
}

export interface VersionPlanTasklistGraphHumanState {
    strategyReview?: {
        decision: StrategyReviewDecision
        reviewRound: 1 | 2
    }
    tasklistRevisionReview?: {
        decision: TasklistRevisionReviewDecision
        reviewRound: 1
    }
}

export type VersionPlanTasklistGraphRuntimeStateUpdate = Partial<Omit<VersionPlanTasklistGraphRuntimeState, 'runtimeMode'>> & {
    runtimeMode?: 'graph'
}

export interface VersionPlanTasklistGraphState {
    execution: VersionPlanTasklistGraphExecutionState
    graph: VersionPlanTasklistGraphRuntimeState
    human: VersionPlanTasklistGraphHumanState
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

function mergeGraphValue<T extends object>(left: T, right: Partial<T>): T {
    return {
        ...left,
        ...right,
    }
}

function reduceVersionPlanTasklistGraphExecutionState(
    left: VersionPlanTasklistGraphExecutionState,
    right: VersionPlanTasklistGraphExecutionStatePatch
): VersionPlanTasklistGraphExecutionState {
    return {
        ...left,
        ...right,
        counters: right.counters
            ? {
                  ...left.counters,
                  ...right.counters,
              }
            : left.counters,
    }
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
    conversationId: string
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
    versionPlanReference: ChatComposerReference
}): VersionPlanTasklistGraphState {
    // threadId 只服务 graph/checkpoint 调试，不改变既有 conversation 数据模型。
    return {
        execution: {
            agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
            counters: {
                draftRevisions: 0,
                optionalContextReads: 0,
                steps: 0,
                strategyRegenerations: 0,
            },
            limits: VERSION_PLAN_TASKLIST_AGENT_LIMITS,
            runId: options.runId,
            status: 'idle',
        },
        graph: createInitialVersionPlanTasklistGraphRuntimeState(options.runtimeConfig.graphCheckpointMode),
        human: {},
        input: {
            planUri: options.versionPlanReference.uri,
            userGoal: options.userGoal,
        },
        planning: {
            manualReviewItems: [],
        },
        source: {
            versionPlanReference: options.versionPlanReference,
        },
        tasklist: {},
        threadId: buildVersionPlanTasklistGraphThreadId({
            conversationId: options.conversationId,
            runId: options.runId,
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

export function applyVersionPlanTasklistGraphStateUpdate(
    state: VersionPlanTasklistGraphStateAnnotationState,
    update: VersionPlanTasklistGraphStatePatch
): VersionPlanTasklistGraphStateAnnotationState {
    return {
        execution: update.execution ? reduceVersionPlanTasklistGraphExecutionState(state.execution, update.execution) : state.execution,
        graph: update.graph ? reduceVersionPlanTasklistGraphRuntimeState(state.graph, update.graph) : state.graph,
        human: update.human ? mergeGraphValue(state.human, update.human) : state.human,
        input: update.input ?? state.input,
        output: update.output ?? state.output,
        planning: update.planning ? mergeGraphValue(state.planning, update.planning) : state.planning,
        source: update.source ? mergeGraphValue(state.source, update.source) : state.source,
        tasklist: update.tasklist ? mergeGraphValue(state.tasklist, update.tasklist) : state.tasklist,
        threadId: update.threadId ?? state.threadId,
    }
}

// GraphState 只定义 LangGraph 如何合并 node 返回的 partial update。
// 领域状态机直接返回受控 GraphState patch，避免 node 在两套整包状态之间往返转换。
// graph 只记录编排轨迹和脱敏摘要，reducer 会合并 partial update，并追加 visitedNodes、routes 等轨迹数组。
// input 是本轮固定输入快照，后续 node 不应改写用户目标或显式引用的 version plan URI。
// output 只保存 runner 需要的最终状态摘要，不承载完整 tasklist、prompt、资源正文或 tool 原始输出。
// threadId 只服务 graph/checkpoint 调试链路，不改变 conversation 数据模型，也不作为普通用户概念暴露。
export const VersionPlanTasklistGraphStateAnnotation = Annotation.Root({
    execution: Annotation<VersionPlanTasklistGraphExecutionState, VersionPlanTasklistGraphExecutionStatePatch>({
        reducer: reduceVersionPlanTasklistGraphExecutionState,
    }),
    graph: Annotation<VersionPlanTasklistGraphRuntimeState, VersionPlanTasklistGraphRuntimeStateUpdate>({
        default: createInitialVersionPlanTasklistGraphRuntimeState,
        reducer: reduceVersionPlanTasklistGraphRuntimeState,
    }),
    human: Annotation<VersionPlanTasklistGraphHumanState, Partial<VersionPlanTasklistGraphHumanState>>({
        reducer: mergeGraphValue,
    }),
    input: Annotation<VersionPlanTasklistGraphInput, VersionPlanTasklistGraphInput>({
        reducer: replaceGraphValue,
    }),
    output: Annotation<VersionPlanTasklistGraphOutput | undefined, VersionPlanTasklistGraphOutput | undefined>({
        reducer: replaceGraphValue,
    }),
    planning: Annotation<VersionPlanTasklistGraphPlanningState, Partial<VersionPlanTasklistGraphPlanningState>>({
        reducer: mergeGraphValue,
    }),
    source: Annotation<VersionPlanTasklistGraphSourceState, Partial<VersionPlanTasklistGraphSourceState>>({
        reducer: mergeGraphValue,
    }),
    tasklist: Annotation<VersionPlanTasklistGraphTasklistState, Partial<VersionPlanTasklistGraphTasklistState>>({
        reducer: mergeGraphValue,
    }),
    threadId: Annotation<string, string>({
        reducer: replaceGraphValue,
    }),
})

export type VersionPlanTasklistGraphStateAnnotationState = typeof VersionPlanTasklistGraphStateAnnotation.State
export type VersionPlanTasklistGraphStateAnnotationUpdate = typeof VersionPlanTasklistGraphStateAnnotation.Update
export interface VersionPlanTasklistGraphExecutionStatePatch extends Partial<Omit<VersionPlanTasklistGraphExecutionState, 'counters'>> {
    counters?: Partial<VersionPlanTasklistGraphExecutionState['counters']>
}
export interface VersionPlanTasklistGraphStatePatch {
    execution?: VersionPlanTasklistGraphExecutionStatePatch
    graph?: VersionPlanTasklistGraphRuntimeStateUpdate
    human?: Partial<VersionPlanTasklistGraphHumanState>
    input?: VersionPlanTasklistGraphInput
    output?: VersionPlanTasklistGraphOutput
    planning?: Partial<VersionPlanTasklistGraphPlanningState>
    source?: Partial<VersionPlanTasklistGraphSourceState>
    tasklist?: Partial<VersionPlanTasklistGraphTasklistState>
    threadId?: string
}
