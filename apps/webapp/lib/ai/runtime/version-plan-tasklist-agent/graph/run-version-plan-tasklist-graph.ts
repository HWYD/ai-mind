import { writeStaticTextPart } from '@ai-mind/stream-core'
import { Command } from '@langchain/langgraph'

import type { AgentRunResultStatus } from '@/lib/ai/agent-runs/contracts'
import { createId } from '@/lib/ai/create-id'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

import type { ChatExecutionContext, WriteChunk } from '../../types'
import { getVersionPlanTasklistCheckpointer } from '../checkpoint/checkpointer-provider'
import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import { type TasklistAgentInterruptPayload, tasklistAgentInterruptPayloadSchema } from '../contract/hitl-review-schema'
import type { TasklistAgentModelSet } from '../model/tasklist-agent-model-set'
import { createVersionPlanTasklistGraph } from './create-version-plan-tasklist-graph'
import { buildGraphDebugSummary } from './graph-debug-summary'
import { createInitialVersionPlanTasklistGraphState, type VersionPlanTasklistGraphStateAnnotationState } from './graph-state'

export interface RunVersionPlanTasklistGraphOptions {
    assistantMessageId?: string
    context: ChatExecutionContext
    conversationId: string
    models: TasklistAgentModelSet
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    threadId?: string
    userGoal: string
    versionPlanReference: ChatComposerReference
    writeChunk: WriteChunk
}

export interface ResumeVersionPlanTasklistGraphOptions {
    context: ChatExecutionContext
    decision: unknown
    models: TasklistAgentModelSet
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    threadId: string
    userGoal: string
    writeChunk: WriteChunk
}

export interface VersionPlanTasklistGraphInterrupt {
    langgraphInterruptId: string
    payload: TasklistAgentInterruptPayload
}

export type RunVersionPlanTasklistGraphResult =
    | {
          graphState: VersionPlanTasklistGraphStateAnnotationState
          interrupt: VersionPlanTasklistGraphInterrupt
          status: 'interrupted'
      }
    | {
          graphState: VersionPlanTasklistGraphStateAnnotationState
          resultStatus: Exclude<AgentRunResultStatus, 'rejected'>
          status: 'completed'
      }
    | {
          graphState: VersionPlanTasklistGraphStateAnnotationState
          status: 'rejected'
      }
    | {
          failureCode: string
          failureMessage: string
          graphState: VersionPlanTasklistGraphStateAnnotationState
          status: 'failed'
      }

interface GraphStateSnapshotTaskInterrupt {
    id?: string
    value?: unknown
}

interface GraphStateSnapshotTask {
    interrupts?: GraphStateSnapshotTaskInterrupt[]
}

interface GraphStateSnapshot {
    tasks?: GraphStateSnapshotTask[]
    values?: unknown
}

interface InvokeCompiledTasklistGraphOptions {
    graphState: VersionPlanTasklistGraphStateAnnotationState
    snapshot: GraphStateSnapshot
    writeChunk: WriteChunk
}

interface CreateCompiledTasklistGraphOptions {
    context: ChatExecutionContext
    models: TasklistAgentModelSet
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
    writeChunk: WriteChunk
}

interface CompiledTasklistGraph {
    getState(config: { configurable: { thread_id: string } }): Promise<GraphStateSnapshot>
    invoke(input: unknown, config: { configurable: { thread_id: string } }): Promise<VersionPlanTasklistGraphStateAnnotationState>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function hasExecutionState(value: unknown): value is VersionPlanTasklistGraphStateAnnotationState['execution'] {
    return (
        isRecord(value) &&
        typeof value.agentName === 'string' &&
        typeof value.runId === 'string' &&
        isRecord(value.counters) &&
        isRecord(value.limits) &&
        typeof value.status === 'string'
    )
}

function isGraphStateAnnotationState(value: unknown): value is VersionPlanTasklistGraphStateAnnotationState {
    return (
        isRecord(value) &&
        typeof value.threadId === 'string' &&
        hasExecutionState(value.execution) &&
        isRecord(value.graph) &&
        isRecord(value.human) &&
        isRecord(value.input) &&
        isRecord(value.planning) &&
        isRecord(value.source) &&
        isRecord(value.tasklist)
    )
}

function resolveGraphState(
    graphState: VersionPlanTasklistGraphStateAnnotationState,
    snapshot: GraphStateSnapshot
): VersionPlanTasklistGraphStateAnnotationState {
    if (isGraphStateAnnotationState(graphState)) {
        return graphState
    }

    if (isGraphStateAnnotationState(snapshot.values)) {
        return snapshot.values
    }

    return graphState
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
            '请确认引用的是可读取的 demo://version-plans/*.md 文件。本版不会自动扫描 demo version-plans 目录，也不会读取真实项目目录。',
        ].join('\n')
    )
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

function createCompiledTasklistGraph(options: CreateCompiledTasklistGraphOptions): CompiledTasklistGraph {
    const checkpointer = getVersionPlanTasklistCheckpointer(options.runtimeConfig.graphCheckpointMode)

    if (!checkpointer) {
        throw new Error(
            'Tasklist Agent HITL requires a LangGraph checkpointer. Set AI_MIND_GRAPH_CHECKPOINT to memory or postgres before starting the WebApp.'
        )
    }

    return createVersionPlanTasklistGraph({
        checkpointer,
        runtime: {
            context: options.context,
            models: options.models,
            runtimeConfig: options.runtimeConfig,
            userGoal: options.userGoal,
            writeChunk: options.writeChunk,
        },
    })
}

function extractSingleActiveInterrupt(snapshot: GraphStateSnapshot): VersionPlanTasklistGraphInterrupt | undefined {
    const interrupts = (snapshot.tasks ?? []).flatMap(task => task.interrupts ?? [])

    if (interrupts.length === 0) {
        return undefined
    }

    if (interrupts.length > 1) {
        throw new Error('Multiple active tasklist agent interrupts are not supported.')
    }

    const interrupt = interrupts[0]

    if (!interrupt.id) {
        throw new Error('LangGraph interrupt id is missing from state snapshot.')
    }

    const parsedPayload = tasklistAgentInterruptPayloadSchema.safeParse(interrupt.value)

    if (!parsedPayload.success) {
        throw new Error('LangGraph interrupt payload does not match Tasklist Agent HITL schema.')
    }

    return {
        langgraphInterruptId: interrupt.id,
        payload: parsedPayload.data,
    }
}

function classifyCompletedResultStatus(
    graphState: VersionPlanTasklistGraphStateAnnotationState
): Exclude<AgentRunResultStatus, 'rejected'> {
    return graphState.planning.revisionEffect?.finalDecision ?? 'blocked'
}

function classifyGraphResult(options: InvokeCompiledTasklistGraphOptions): RunVersionPlanTasklistGraphResult {
    const interrupt = extractSingleActiveInterrupt(options.snapshot)

    writeGraphReadFailureAnswer(options.writeChunk, options.graphState)

    if (interrupt) {
        return {
            graphState: options.graphState,
            interrupt,
            status: 'interrupted',
        }
    }

    if (options.graphState.output?.status === 'failed') {
        return {
            failureCode: 'TASKLIST_AGENT_GRAPH_FAILED',
            failureMessage:
                options.graphState.output.errorMessage ?? options.graphState.output.textSummary ?? 'Tasklist Agent graph failed.',
            graphState: options.graphState,
            status: 'failed',
        }
    }

    const strategyRejected = options.graphState.human.strategyReview?.decision.type === 'reject'
    const revisionRejected = options.graphState.human.tasklistRevisionReview?.decision.type === 'reject'

    if (strategyRejected || revisionRejected) {
        return {
            graphState: options.graphState,
            status: 'rejected',
        }
    }

    return {
        graphState: options.graphState,
        resultStatus: classifyCompletedResultStatus(options.graphState),
        status: 'completed',
    }
}

export async function runInitialVersionPlanTasklistGraph(
    options: RunVersionPlanTasklistGraphOptions
): Promise<RunVersionPlanTasklistGraphResult> {
    const initialGraphState = createInitialVersionPlanTasklistGraphState({
        conversationId: options.conversationId,
        runId: options.runId,
        runtimeConfig: options.runtimeConfig,
        userGoal: options.userGoal,
        versionPlanReference: options.versionPlanReference,
    })
    const graphStateForRun = options.threadId
        ? {
              ...initialGraphState,
              threadId: options.threadId,
          }
        : initialGraphState
    const graph = createCompiledTasklistGraph(options)
    const graphState = await graph.invoke(graphStateForRun, {
        configurable: {
            thread_id: graphStateForRun.threadId,
        },
    })
    const snapshot = await graph.getState({
        configurable: {
            thread_id: graphStateForRun.threadId,
        },
    })
    const resolvedGraphState = resolveGraphState(graphState, snapshot)

    writeGraphDebugSummary(options.writeChunk, resolvedGraphState, options.runtimeConfig)

    return classifyGraphResult({
        graphState: resolvedGraphState,
        snapshot,
        writeChunk: options.writeChunk,
    })
}

export async function resumeVersionPlanTasklistGraph(
    options: ResumeVersionPlanTasklistGraphOptions
): Promise<RunVersionPlanTasklistGraphResult> {
    const graph = createCompiledTasklistGraph(options)
    const config = {
        configurable: {
            thread_id: options.threadId,
        },
    }
    const graphState = await graph.invoke(
        new Command({
            resume: options.decision,
        }),
        config
    )
    const snapshot = await graph.getState(config)
    const resolvedGraphState = resolveGraphState(graphState, snapshot)

    writeGraphDebugSummary(options.writeChunk, resolvedGraphState, options.runtimeConfig)

    return classifyGraphResult({
        graphState: resolvedGraphState,
        snapshot,
        writeChunk: options.writeChunk,
    })
}

export async function runVersionPlanTasklistGraph(options: RunVersionPlanTasklistGraphOptions): Promise<RunVersionPlanTasklistGraphResult> {
    return runInitialVersionPlanTasklistGraph(options)
}
