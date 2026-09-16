import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { ChatStreamChunk, StreamEventEnvelope } from '@ai-mind/stream-core/protocol'
import { type ChunkWriter, createNdjsonChunkWriter } from '@ai-mind/stream-core/web'

import type { AgentRunService } from '@/lib/ai/agent-runs'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'
import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'
import { generalReActObserver } from '@/lib/ai/runtime/general-react-agent/general-react-agent-observer'
import { GENERAL_REACT_RUNTIME_DEFAULTS } from '@/lib/ai/runtime/general-react-agent/runtime-config'
import { createImagePlanningModel } from '@/lib/ai/runtime/image-generation-agent/graph/fixed-image-planning-model'
import { ImageGenerationRunCoordinator } from '@/lib/ai/runtime/image-generation-agent/image-generation-run-coordinator'
import { logChatCancellation, normalizeKnownRuntimeError } from '@/lib/ai/runtime/stream-errors'
import type { ChatExecutionContext, ResolvedChatExecutionContext, StreamResult, WriteChunk } from '@/lib/ai/runtime/types'
import type { PreparedVersionPlanTasklistAgentResume } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { resumeVersionPlanTasklistAgentRun } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import type { TasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { VERSION_PLAN_TASKLIST_AGENT_NAME } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import type { TasklistAgentModelSet } from '@/lib/ai/runtime/version-plan-tasklist-agent/model/tasklist-agent-model-set'
import type { StreamEventEnvelopeDto, StreamTerminalStateDto } from '@/lib/ai/stream-recovery/contracts'
import { DurableStreamProjectionBuffer } from '@/lib/ai/stream-recovery/durable-stream-projection-buffer'
import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'
import {
    getSharedStreamExecutionCoordinator,
    StreamExecutionCoordinator,
    StreamExecutionCoordinatorError,
} from '@/lib/ai/stream-recovery/stream-execution-coordinator'
import type { ChatRequest } from '@/lib/ai/types/chat'

export type { ChatExecutionContext, ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

const STREAM_HEARTBEAT_INTERVAL_MS = 15_000
const GENERAL_REACT_RUN_DEADLINE_MS = GENERAL_REACT_RUNTIME_DEFAULTS.hardDeadlineMs

interface StreamExecutorOptions {
    deferCleanup: (cleanup: () => void | Promise<void>) => void
    isClosed: () => boolean
    writeChunk: WriteChunk
    writeTerminalChunk?: (
        chunk: ChatStreamChunk,
        terminalState: StreamTerminalStateDto,
        options?: { explicitCancellation?: true }
    ) => Promise<void>
}

interface ChatServiceDependencies {
    imageGenerationRunCoordinator?: Pick<ImageGenerationRunCoordinator, 'run'>
    streamEventProjector?: Pick<StreamEventProjector, 'projectChunk'> & Partial<Pick<StreamEventProjector, 'projectChunks'>>
    streamExecutionCoordinator?: Pick<StreamExecutionCoordinator, 'startExecution'> &
        Partial<Pick<StreamExecutionCoordinator, 'getCancelRequestedAt'>>
}

interface ResumableStreamWriterOptions {
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
    getProjector: () => Pick<StreamEventProjector, 'projectChunk'> & Partial<Pick<StreamEventProjector, 'projectChunks'>>
    writer: ChunkWriter
}

interface ResumeAgentRunStreamInput {
    agentRunService?: AgentRunService
    decision: unknown
    interruptId: string
    models: TasklistAgentModelSet
    preparedResume?: PreparedVersionPlanTasklistAgentResume
    runId: string
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
}

interface RejectAgentRunStreamInput {
    assistantMessageId: string
    interruptId: string
    runId: string
    summary: string
    threadId: string
}

interface ImageGenerationStreamInput {
    assistantMessageId: string
    rawDescription: string
    runId: string
}

function normalizeResumeStreamError(
    error: unknown,
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
): { code: import('@ai-mind/stream-core/protocol').StreamErrorCode; message: string; retryable: boolean } {
    if (findStreamEventStoreError(error)) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: '流事件无法安全持久化，当前流已失败，请重新发起请求。',
            retryable: false,
        }
    }

    const knownRuntimeError = normalizeKnownRuntimeError(error)

    if (knownRuntimeError) {
        return knownRuntimeError
    }

    if (!context.resolvedModelSelection) {
        return {
            code: 'MODEL_STREAM_FAILED',
            message: '模型配置不可用。',
            retryable: false,
        }
    }

    const modelHandle = createChatModel({
        config: getModelProviderConfig(),
        enableReasoning: false,
        resolvedModelSelection: context.resolvedModelSelection,
        streaming: false,
        temperature: 0,
    })

    const normalizedError = modelHandle.normalizeError(error)
    return {
        code: normalizedError.code as import('@ai-mind/stream-core/protocol').StreamErrorCode,
        message: normalizedError.message,
        retryable: normalizedError.retryable,
    }
}

function createProjectionFailureChunk(
    error: unknown,
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
): ChatStreamChunk {
    const normalizedProjectionError = normalizeResumeStreamError(error, context)

    return {
        errorCode: normalizedProjectionError.code,
        message: normalizedProjectionError.message,
        retryable: false,
        scope: 'runtime',
        stage: 'runtime',
        type: 'error',
    }
}

function createResumableWriteChunk(options: ResumableStreamWriterOptions): {
    drain: () => Promise<void>
    getProjectionError: () => unknown
    writeChunk: WriteChunk
    writeTerminalChunk: (
        chunk: ChatStreamChunk,
        terminalState: StreamTerminalStateDto,
        options?: { explicitCancellation?: true }
    ) => Promise<void>
} {
    let projectionError: unknown
    let terminalWrite: Promise<void> | undefined
    let publishChain = Promise.resolve()

    const buffer = new DurableStreamProjectionBuffer({
        appendEvents: async (inputs, projectionOptions) => {
            const projector = options.getProjector()
            if (projector.projectChunks) {
                return projector.projectChunks(
                    inputs.map(input => ({
                        chunk: input.payload as ChatStreamChunk,
                        ownerSessionHash: input.ownerSessionHash,
                        runId: input.runId,
                        ...(input.runStatus ? { runStatus: input.runStatus } : {}),
                        ...(input.terminalState ? { terminalState: input.terminalState } : {}),
                    })),
                    projectionOptions
                )
            }

            const events: StreamEventEnvelopeDto[] = []
            for (const input of inputs) {
                events.push(
                    await projector.projectChunk({
                        chunk: input.payload as ChatStreamChunk,
                        ownerSessionHash: input.ownerSessionHash,
                        runId: input.runId,
                        ...(input.runStatus ? { runStatus: input.runStatus } : {}),
                        ...(input.terminalState ? { terminalState: input.terminalState } : {}),
                    })
                )
            }
            return events
        },
        publishCommitted: async envelope => {
            if (!options.writer.isClosed()) {
                options.writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
            }
        },
        observer: generalReActObserver,
        deadlineAtMs: options.context.runDeadlineAtMs,
        signal: options.context.signal,
    })

    const projectChunk = (chunk: ChatStreamChunk, terminalState?: StreamTerminalStateDto): Promise<void> => {
        const recovery = options.context.streamRecovery!
        const publish = publishChain.then(() =>
            buffer.publish({
                eventKind: terminalState ? 'terminal' : 'chunk',
                ownerSessionHash: recovery.ownerSessionHash,
                payload: chunk as StreamEventEnvelopeDto['payload'],
                runId: recovery.runId,
                ...(terminalState ? { terminalState } : {}),
            })
        )
        const monitoredPublish = publish.catch(error => {
            projectionError ??= error
            throw error
        })

        publishChain = monitoredPublish.catch(() => undefined)
        return monitoredPublish
    }

    return {
        drain: async () => {
            await publishChain
            try {
                await buffer.drain()
            } catch (error) {
                projectionError ??= error
            }
            if (terminalWrite) {
                await terminalWrite.catch(error => {
                    projectionError ??= error
                })
            }
        },
        getProjectionError: () => projectionError,
        // StreamLifecycle、static parts 和 Memory status 都是同步调用 WriteChunk 的旧调用面。
        // 这里吞掉每个未 await 的 rejection，同时由 publishChain/drain 统一暴露首个投影失败并保持顺序。
        writeChunk: chunk => {
            void projectChunk(chunk).catch(error => {
                projectionError ??= error
            })
        },
        writeTerminalChunk: (chunk, terminalState, terminalOptions) => {
            if (!terminalWrite) {
                terminalWrite = (async () => {
                    if (terminalOptions?.explicitCancellation && terminalState === 'cancelled') {
                        const recovery = options.context.streamRecovery!
                        const envelope = await options.getProjector().projectChunk(
                            {
                                chunk,
                                ownerSessionHash: recovery.ownerSessionHash,
                                runId: recovery.runId,
                                terminalState,
                            },
                            options.context.runDeadlineAtMs === undefined ? undefined : { deadlineAtMs: options.context.runDeadlineAtMs }
                        )

                        if (!options.writer.isClosed()) {
                            options.writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
                        }
                        return
                    }

                    let terminalProjectionError = projectionError
                    if (!terminalProjectionError) {
                        try {
                            await projectChunk(chunk, terminalState)
                            return
                        } catch (error) {
                            // 排队投影失败后，唯一终态改为直接投影的 failed error chunk。
                            terminalProjectionError = error
                        }
                    }

                    const recovery = options.context.streamRecovery!
                    const envelope = await options.getProjector().projectChunk(
                        {
                            chunk: createProjectionFailureChunk(terminalProjectionError, options.context),
                            ownerSessionHash: recovery.ownerSessionHash,
                            runId: recovery.runId,
                            terminalState: 'failed',
                        },
                        options.context.runDeadlineAtMs === undefined ? undefined : { deadlineAtMs: options.context.runDeadlineAtMs }
                    )

                    if (!options.writer.isClosed()) {
                        options.writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
                    }
                })()
            }

            return terminalWrite
        },
    }
}

async function createNdjsonStreamResult(
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] },
    execute: (
        options: StreamExecutorOptions,
        executionContext: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
    ) => Promise<void>,
    dependencies: ChatServiceDependencies = {},
    runDeadlineAtMs?: number
): Promise<StreamResult> {
    let closed = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let writerRef: ChunkWriter | null = null
    let projector: (Pick<StreamEventProjector, 'projectChunk'> & Partial<Pick<StreamEventProjector, 'projectChunks'>>) | undefined
    let coordinator:
        | (Pick<StreamExecutionCoordinator, 'startExecution'> & Partial<Pick<StreamExecutionCoordinator, 'getCancelRequestedAt'>>)
        | undefined
    const getProjector = () => {
        projector ??= dependencies.streamEventProjector ?? new StreamEventProjector()

        return projector
    }

    const getCoordinator = () => {
        coordinator ??= dependencies.streamExecutionCoordinator ?? getSharedStreamExecutionCoordinator()

        return coordinator
    }

    const responseStream = new ReadableStream<Uint8Array>({
        start(controller) {
            const writer = createNdjsonChunkWriter(controller)
            writerRef = writer
            let projectionDrain: (() => Promise<void>) | undefined

            const isResponseClosed = () => closed || writer.isClosed()
            const isExecutionClosed = (
                executionContext: ChatExecutionContext & {
                    resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection']
                } = context
            ) => Boolean(executionContext.signal?.aborted)

            const closeStream = () => {
                if (closed) {
                    return
                }

                closed = true
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer)
                    heartbeatTimer = null
                }
                writer.close()
            }

            heartbeatTimer = setInterval(() => {
                if (isResponseClosed()) {
                    closeStream()
                    return
                }

                try {
                    writer.writeHeartbeat()
                } catch {
                    closeStream()
                }
            }, STREAM_HEARTBEAT_INTERVAL_MS)

            const runWithContext = async (
                executionContext: ChatExecutionContext & {
                    resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection']
                }
            ) => {
                const deferredCleanups: Array<() => void | Promise<void>> = []
                const runController = new AbortController()
                let deadlineTimer: ReturnType<typeof setTimeout> | undefined
                let deadlineTriggered = false
                const onExecutionAbort = () => runController.abort(executionContext.signal?.reason)

                if (executionContext.signal?.aborted) {
                    onExecutionAbort()
                } else {
                    executionContext.signal?.addEventListener('abort', onExecutionAbort, { once: true })
                }

                if (runDeadlineAtMs !== undefined) {
                    const remainingMs = Math.max(1, runDeadlineAtMs - Date.now() - GENERAL_REACT_RUNTIME_DEFAULTS.terminalReserveMs)
                    deadlineTimer = setTimeout(() => {
                        deadlineTriggered = true
                        runController.abort(new DOMException('General ReAct run deadline exceeded.', 'TimeoutError'))
                    }, remainingMs)
                }

                const runExecutionContext = {
                    ...executionContext,
                    ...(runDeadlineAtMs === undefined ? {} : { runDeadlineAtMs }),
                    signal: runController.signal,
                }
                const writerOptions = createResumableWriteChunk({
                    context: runExecutionContext,
                    getProjector,
                    writer,
                })
                projectionDrain = writerOptions.drain

                try {
                    await execute(
                        {
                            deferCleanup: cleanup => deferredCleanups.push(cleanup),
                            isClosed: () => isExecutionClosed(runExecutionContext),
                            writeChunk: writerOptions.writeChunk,
                            writeTerminalChunk: writerOptions.writeTerminalChunk,
                        },
                        runExecutionContext
                    )
                } catch (streamError) {
                    const abortLikeError =
                        isAbortError(streamError) || runExecutionContext.signal?.aborted || isExecutionClosed(runExecutionContext)
                    const cancellationRequested =
                        abortLikeError &&
                        runExecutionContext.streamRecovery &&
                        typeof getCoordinator().getCancelRequestedAt === 'function' &&
                        Boolean(
                            await getCoordinator()
                                .getCancelRequestedAt(runExecutionContext.streamRecovery.runId)
                                .catch(() => null)
                        )

                    if (cancellationRequested) {
                        await writerOptions.writeTerminalChunk({ type: 'finish' }, 'cancelled', { explicitCancellation: true })
                        return
                    }

                    if (deadlineTriggered) {
                        await writerOptions.writeTerminalChunk(
                            {
                                errorCode: 'MODEL_PROVIDER_TIMEOUT',
                                message: 'Agent 运行时间已到。',
                                retryable: false,
                                scope: 'runtime',
                                stage: 'runtime',
                                type: 'error',
                            },
                            'failed'
                        )
                        return
                    }

                    if (abortLikeError) {
                        if (runExecutionContext.signal?.aborted || isAbortError(streamError)) {
                            logChatCancellation('model stream aborted')
                        }
                        return
                    }

                    if (isInvalidSkillError(streamError)) {
                        const errorChunk: ChatStreamChunk = {
                            scope: 'request',
                            errorCode: 'INVALID_SKILL',
                            retryable: false,
                            message: streamError.message,
                            type: 'error',
                        }
                        await writerOptions.writeTerminalChunk(errorChunk, 'failed')
                        return
                    }

                    const normalizedRuntimeError = normalizeResumeStreamError(streamError, executionContext)

                    const runtimeErrorChunk: ChatStreamChunk = {
                        scope: 'runtime',
                        errorCode: normalizedRuntimeError.code,
                        retryable: normalizedRuntimeError.retryable,
                        message: normalizedRuntimeError.message,
                        stage: 'runtime',
                        type: 'error',
                    }
                    await writerOptions.writeTerminalChunk(runtimeErrorChunk, 'failed')
                } finally {
                    try {
                        await projectionDrain?.()

                        const projectionError = writerOptions.getProjectionError()

                        if (projectionError && !runExecutionContext.signal?.aborted) {
                            const projectionStoreError = findStreamEventStoreError(projectionError)
                            if (projectionStoreError) {
                                // 不记录 payload，避免把模型输出或运行时数据写入服务端日志。
                                // eslint-disable-next-line no-console
                                console.error('Resumable stream event projection failed:', { code: projectionStoreError.code })
                            }
                            await writerOptions.writeTerminalChunk(
                                createProjectionFailureChunk(projectionError, executionContext),
                                'failed'
                            )
                            await projectionDrain?.()
                        }
                    } catch (finalizationError) {
                        const envelope = await getProjector()
                            .projectChunk({
                                chunk: {
                                    errorCode: 'RUNTIME_INVARIANT_FAILED',
                                    message: 'Chat stream failed unexpectedly.',
                                    retryable: false,
                                    scope: 'runtime',
                                    stage: 'runtime',
                                    type: 'error',
                                },
                                ownerSessionHash: runExecutionContext.streamRecovery!.ownerSessionHash,
                                runId: runExecutionContext.streamRecovery!.runId,
                                terminalState: 'failed',
                            })
                            .catch(() => {
                                throw finalizationError
                            })

                        if (!writer.isClosed()) {
                            writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
                        }
                    } finally {
                        for (const cleanup of deferredCleanups.reverse()) {
                            try {
                                await cleanup()
                            } catch (cleanupError) {
                                // 清理是 run-owned 资源的兜底，单项失败不得阻止其余 timer、permit、listener 或 writer 收口。
                                // eslint-disable-next-line no-console
                                console.error('Deferred stream cleanup failed:', cleanupError)
                            }
                        }

                        closeStream()
                        if (deadlineTimer) clearTimeout(deadlineTimer)
                        executionContext.signal?.removeEventListener('abort', onExecutionAbort)
                    }
                }
            }

            const run = async () => {
                await getCoordinator().startExecution({
                    execute: async execution => {
                        await runWithContext({
                            ...context,
                            signal: execution.signal,
                        })
                    },
                    ownerSessionHash: context.streamRecovery!.ownerSessionHash,
                    requestSignal: context.streamRecovery.requestSignal,
                    runId: context.streamRecovery!.runId,
                })
            }

            void run().catch(async error => {
                if (isAbortError(error) || context.signal?.aborted) {
                    closeStream()
                    return
                }

                if (error instanceof StreamExecutionCoordinatorError) {
                    // 第二个 executor 或已经结束的 run 不应覆盖现有终态。
                    closeStream()
                    return
                }

                // eslint-disable-next-line no-console
                console.error('Chat stream failed:', error)
                const terminalErrorChunk: ChatStreamChunk = {
                    scope: 'runtime',
                    errorCode: 'RUNTIME_INVARIANT_FAILED',
                    retryable: false,
                    message: 'Chat stream failed unexpectedly.',
                    stage: 'runtime',
                    type: 'error',
                }

                try {
                    const envelope = await getProjector().projectChunk({
                        chunk: terminalErrorChunk,
                        ownerSessionHash: context.streamRecovery!.ownerSessionHash,
                        runId: context.streamRecovery!.runId,
                        terminalState: 'failed',
                    })

                    if (!isResponseClosed()) {
                        writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
                    }
                } catch (projectionError) {
                    // eslint-disable-next-line no-console
                    console.error('Resumable stream outer failure projection failed:', projectionError)
                }
                closeStream()
            })
        },
        cancel() {
            logChatCancellation('response stream consumer cancelled')
            closed = true
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
            }
            writerRef?.close()
        },
    })

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
    }

    if (context.setCookie) {
        headers['Set-Cookie'] = context.setCookie
    }

    return {
        body: responseStream,
        headers,
    }
}

function findStreamEventStoreError(error: unknown): StreamEventStoreError | undefined {
    if (error instanceof StreamEventStoreError) {
        return error
    }

    if (error && typeof error === 'object' && 'cause' in error) {
        const cause = (error as { cause?: unknown }).cause
        return cause instanceof StreamEventStoreError ? cause : undefined
    }

    return undefined
}

async function createChatStreamResult(
    request: ChatRequest,
    context: ResolvedChatExecutionContext,
    dependencies: ChatServiceDependencies
): Promise<StreamResult> {
    const commandName = request.composer?.command?.name
    const runDeadlineAtMs =
        context.resolvedModelSelection.routeType === 'chat' && commandName !== 'tasklist' && commandName !== 'delivery-chain'
            ? Date.now() + GENERAL_REACT_RUN_DEADLINE_MS
            : undefined

    return createNdjsonStreamResult(
        context,
        async ({ deferCleanup, isClosed, writeChunk, writeTerminalChunk }, executionContext) => {
            const orchestrator = new ChatOrchestrator({
                context: executionContext as ResolvedChatExecutionContext,
                deferCleanup,
                isClosed,
                request,
                writeChunk,
                writeTerminalChunk,
            })

            await orchestrator.run()
        },
        dependencies,
        runDeadlineAtMs
    )
}

async function createImageGenerationStreamResult(
    input: ImageGenerationStreamInput,
    context: ChatExecutionContext,
    dependencies: ChatServiceDependencies
): Promise<StreamResult> {
    return createNdjsonStreamResult(
        context,
        async ({ isClosed, writeChunk }, executionContext) => {
            const lifecycle = new StreamLifecycle({
                context: executionContext,
                isClosed,
                writeChunk,
            })

            lifecycle.emitStartOnce(input.assistantMessageId)
            const coordinator =
                dependencies.imageGenerationRunCoordinator ??
                new ImageGenerationRunCoordinator({
                    planningModel: createImagePlanningModel(),
                })
            await coordinator.run({
                rawDescription: input.rawDescription,
                runId: input.runId,
                signal: executionContext.signal,
                writeChunk,
            })
        },
        dependencies
    )
}

async function createResumeAgentRunStreamResult(
    input: ResumeAgentRunStreamInput,
    context: ResolvedChatExecutionContext,
    dependencies: ChatServiceDependencies
): Promise<StreamResult> {
    return createNdjsonStreamResult(
        context,
        async ({ isClosed, writeChunk }, executionContext) => {
            const lifecycle = new StreamLifecycle({
                context: executionContext,
                isClosed,
                writeChunk,
            })

            if (!executionContext.sessionId) {
                throw new Error('Tasklist Agent resume requires an owned chat session.')
            }

            const agentRunResult = await resumeVersionPlanTasklistAgentRun({
                agentRunService: input.agentRunService,
                context: executionContext as ResolvedChatExecutionContext,
                decision: input.decision,
                interruptId: input.interruptId,
                models: input.models,
                preparedResume: input.preparedResume,
                runId: input.runId,
                runtimeConfig: input.runtimeConfig,
                sessionId: executionContext.sessionId,
                userGoal: input.userGoal,
                writeChunk,
            })

            if (agentRunResult.graphResult.status !== 'interrupted') {
                lifecycle.emitFinishIfOpen()
            }
        },
        dependencies
    )
}

async function createRejectAgentRunStreamResult(
    input: RejectAgentRunStreamInput,
    context: ChatExecutionContext,
    dependencies: ChatServiceDependencies
): Promise<StreamResult> {
    return createNdjsonStreamResult(
        context,
        async ({ isClosed, writeChunk, writeTerminalChunk }, executionContext) => {
            const lifecycle = new StreamLifecycle({
                context: executionContext,
                isClosed,
                writeChunk,
            })

            writeChunk({
                agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
                assistantMessageId: input.assistantMessageId,
                interruptId: input.interruptId,
                runId: input.runId,
                threadId: input.threadId,
                type: 'agent-resume',
            })
            writeStaticTextPart(writeChunk, input.summary)
            if (writeTerminalChunk) {
                await writeTerminalChunk({ type: 'finish' }, 'rejected')
            } else {
                lifecycle.emitFinishIfOpen()
            }
        },
        dependencies
    )
}

export function createChatService(dependencies: ChatServiceDependencies = {}) {
    return {
        async streamImage(input: ImageGenerationStreamInput, context: ChatExecutionContext) {
            const streamResult = await createImageGenerationStreamResult(input, context, dependencies)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
        async rejectAgentRun(input: RejectAgentRunStreamInput, context: ChatExecutionContext) {
            const streamResult = await createRejectAgentRunStreamResult(input, context, dependencies)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
        async resumeAgentRun(input: ResumeAgentRunStreamInput, context: ResolvedChatExecutionContext) {
            const streamResult = await createResumeAgentRunStreamResult(input, context, dependencies)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
        async streamChat(request: ChatRequest, context: ResolvedChatExecutionContext) {
            const streamResult = await createChatStreamResult(request, context, dependencies)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
    }
}
