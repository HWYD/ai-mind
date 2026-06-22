import { writeStaticTextPart } from '@ai-mind/stream-core'
import { MemorySaver } from '@langchain/langgraph'

import { createId } from '@/lib/ai/create-id'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { TasklistAgentModelSet } from '../model/tasklist-agent-model-set'
import { createVersionPlanTasklistGraph } from './create-version-plan-tasklist-graph'
import { buildGraphDebugSummary } from './graph-debug-summary'
import { createInitialVersionPlanTasklistGraphState, type VersionPlanTasklistGraphStateAnnotationState } from './graph-state'

export interface RunVersionPlanTasklistGraphOptions {
    context: ChatExecutionContext
    conversationId: string
    models: TasklistAgentModelSet
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
    versionPlanReference: ChatComposerReference
    writeChunk: WriteChunk
}

export interface RunVersionPlanTasklistGraphResult {
    graphState: VersionPlanTasklistGraphStateAnnotationState
}

function writeGraphReadFailureAnswer(writeChunk: WriteChunk, graphState: VersionPlanTasklistGraphStateAnnotationState) {
    if (graphState.output?.status !== 'failed') {
        return
    }

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
    if (!runtimeConfig.graphDebugViewEnabled) {
        return
    }

    writeChunk({
        agentName: graphState.execution.agentName,
        partId: createId(),
        runId: graphState.execution.runId,
        summary: buildGraphDebugSummary(graphState),
        threadId: graphState.threadId,
        type: 'agent-graph-debug-summary',
    })
}

export async function runVersionPlanTasklistGraph(options: RunVersionPlanTasklistGraphOptions): Promise<RunVersionPlanTasklistGraphResult> {
    const initialGraphState = createInitialVersionPlanTasklistGraphState({
        conversationId: options.conversationId,
        runId: options.runId,
        runtimeConfig: options.runtimeConfig,
        userGoal: options.userGoal,
        versionPlanReference: options.versionPlanReference,
    })
    const graph = createVersionPlanTasklistGraph({
        checkpointer: createGraphCheckpointer(options.runtimeConfig),
        runtime: {
            context: options.context,
            models: options.models,
            runtimeConfig: options.runtimeConfig,
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
        },
    })
    const graphState = await graph.invoke(initialGraphState, {
        configurable: {
            thread_id: initialGraphState.threadId,
        },
    })

    writeGraphReadFailureAnswer(options.writeChunk, graphState)
    writeGraphDebugSummary(options.writeChunk, graphState, options.runtimeConfig)

    return {
        graphState,
    }
}
