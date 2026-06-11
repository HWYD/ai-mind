import { writeStaticTextPart } from '@ai-mind/stream-core'
import { MemorySaver } from '@langchain/langgraph'

import { createId } from '@/lib/ai/create-id'

import type { ChatExecutionContext, ChatSession, WriteChunk } from '../../types'
import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { VersionPlanTasklistAgentState } from '../contract/types'
import { createVersionPlanTasklistGraph } from './create-version-plan-tasklist-graph'
import { buildGraphDebugSummary } from './graph-debug-summary'
import { createInitialVersionPlanTasklistGraphState, type VersionPlanTasklistGraphStateAnnotationState } from './graph-state'

export interface RunVersionPlanTasklistGraphOptions {
    context: ChatExecutionContext
    conversationId: string
    model: ChatSession['baseModel']
    runtimeConfig: TasklistAgentRuntimeConfig
    skeletonState: VersionPlanTasklistAgentState
    userGoal: string
    writeChunk: WriteChunk
}

export interface RunVersionPlanTasklistGraphResult {
    graphState: VersionPlanTasklistGraphStateAnnotationState
    state: VersionPlanTasklistAgentState
}

function writeGraphReadFailureAnswer(writeChunk: WriteChunk, graphState: VersionPlanTasklistGraphStateAnnotationState) {
    if (graphState.output?.status !== 'failed') {
        return
    }

    // 读取 version plan 失败时，resource reader 已经写出资源级错误；这里补一段普通文本，
    // 让用户不用只从 Resource 卡片里猜测本轮 Agent 为什么没有继续生成 tasklist。
    writeStaticTextPart(
        writeChunk,
        [
            graphState.output.textSummary ?? '版本方案读取失败，暂时无法继续生成 tasklist 草稿。',
            '',
            `错误信息：${graphState.output.errorMessage ?? '未知错误'}`,
            '',
            '请确认引用的是可读取的 docs://versions/*.md 文件。本版不会自动扫描 versions 目录，也不会读取 docs/tasklists/*。',
        ].join('\n')
    )
}

function createGraphCheckpointer(runtimeConfig: TasklistAgentRuntimeConfig) {
    return runtimeConfig.graphCheckpointMode === 'memory' ? new MemorySaver() : undefined
}

function writeGraphDebugSummary(
    writeChunk: WriteChunk,
    graphState: VersionPlanTasklistGraphStateAnnotationState,
    runtimeConfig: TasklistAgentRuntimeConfig
) {
    if (runtimeConfig.runtimeMode !== 'graph' || !runtimeConfig.graphDebugViewEnabled) {
        return
    }

    writeChunk({
        agentName: graphState.agentState.agentName,
        partId: createId(),
        runId: graphState.agentState.runId,
        summary: buildGraphDebugSummary(graphState),
        threadId: graphState.threadId,
        type: 'agent-graph-debug-summary',
    })
}

export async function runVersionPlanTasklistGraph(options: RunVersionPlanTasklistGraphOptions): Promise<RunVersionPlanTasklistGraphResult> {
    // initialGraphState 是 LangGraph 本轮执行的起始状态：它把 orchestrator 已经创建好的受控 AgentState
    // 包进 GraphState，同时补上 graph runtime 需要的 input、threadId 和配置快照。
    const initialGraphState = createInitialVersionPlanTasklistGraphState({
        agentState: options.skeletonState,
        conversationId: options.conversationId,
        runtimeConfig: options.runtimeConfig,
        userGoal: options.userGoal,
    })

    // graph 本身只描述节点和路由；模型、resource context、stream writer 这类运行时依赖
    // 通过 node factory 注入，避免节点去 import chat orchestrator 或全局运行时。
    const graph = createVersionPlanTasklistGraph({
        checkpointer: createGraphCheckpointer(options.runtimeConfig),
        runtime: {
            context: options.context,
            model: options.model,
            runtimeConfig: options.runtimeConfig,
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
        },
    })

    // invoke 会把 initialGraphState 交给 StateGraph，从 START 开始按 edge / conditional edge 执行节点。
    // 每个节点只返回 partial update，LangGraph 再按 graph-state.ts 里的 Annotation reducer 合并成最终 graphState。
    const graphState = await graph.invoke(initialGraphState, {
        configurable: {
            thread_id: initialGraphState.threadId,
        },
    })

    writeGraphReadFailureAnswer(options.writeChunk, graphState)
    writeGraphDebugSummary(options.writeChunk, graphState, options.runtimeConfig)

    return {
        graphState,
        state: graphState.agentState,
    }
}
