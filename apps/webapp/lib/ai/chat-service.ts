import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { ChatStreamChunk, StreamEventEnvelope } from '@ai-mind/stream-core/protocol'
import { type ChunkWriter, createNdjsonChunkWriter } from '@ai-mind/stream-core/web'

import type { AgentRunService } from '@/lib/ai/agent-runs'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'
import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'
import { logChatCancellation, normalizeKnownRuntimeError } from '@/lib/ai/runtime/stream-errors'
import type { ChatExecutionContext, ResolvedChatExecutionContext, StreamResult, WriteChunk } from '@/lib/ai/runtime/types'
import type { PreparedVersionPlanTasklistAgentResume } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { resumeVersionPlanTasklistAgentRun } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import type { TasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import { VERSION_PLAN_TASKLIST_AGENT_NAME } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import type { TasklistAgentModelSet } from '@/lib/ai/runtime/version-plan-tasklist-agent/model/tasklist-agent-model-set'
import type { StreamTerminalStateDto } from '@/lib/ai/stream-recovery/contracts'
import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamExecutionCoordinator, StreamExecutionCoordinatorError } from '@/lib/ai/stream-recovery/stream-execution-coordinator'
import type { ChatRequest } from '@/lib/ai/types/chat'

export type { ChatExecutionContext, ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

const STREAM_HEARTBEAT_INTERVAL_MS = 15_000

interface StreamExecutorOptions {
    isClosed: () => boolean
    writeChunk: WriteChunk
    writeTerminalChunk?: (chunk: ChatStreamChunk, terminalState: StreamTerminalStateDto) => void
}

interface ChatServiceDependencies {
    streamEventProjector?: Pick<StreamEventProjector, 'projectChunk'>
    streamExecutionCoordinator?: Pick<StreamExecutionCoordinator, 'startExecution'> &
        Partial<Pick<StreamExecutionCoordinator, 'getCancelRequestedAt'>>
}

interface ResumableStreamWriterOptions {
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
    getProjector: () => Pick<StreamEventProjector, 'projectChunk'>
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

function normalizeResumeStreamError(
    error: unknown,
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
): { code: import('@ai-mind/stream-core/protocol').StreamErrorCode; message: string; retryable: boolean } {
    if (error instanceof StreamEventStoreError) {
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

function createResumableWriteChunk(options: ResumableStreamWriterOptions): {
    drain: () => Promise<void>
    getProjectionError: () => unknown
    writeChunk: WriteChunk
    writeTerminalChunk: (chunk: ChatStreamChunk, terminalState: StreamTerminalStateDto) => void
} {
    let projectionQueue = Promise.resolve()
    let projectionError: unknown

    const projectChunk = (chunk: ChatStreamChunk, terminalState?: StreamTerminalStateDto) => {
        const allowAfterProjectionError = terminalState !== undefined

        projectionQueue = projectionQueue
            .catch(error => {
                projectionError ??= error
            })
            .then(async () => {
                if (projectionError && !allowAfterProjectionError) {
                    return
                }

                const recovery = options.context.streamRecovery!

                const envelope = await options.getProjector().projectChunk({
                    chunk,
                    ownerSessionHash: recovery.ownerSessionHash,
                    runId: recovery.runId,
                    ...(terminalState ? { terminalState } : {}),
                })

                if (!options.writer.isClosed()) {
                    options.writer.writeEnvelope(envelope as unknown as StreamEventEnvelope)
                }
            })
    }

    return {
        drain: async () => {
            try {
                await projectionQueue
            } catch (error) {
                projectionError ??= error
            }
        },
        getProjectionError: () => projectionError,
        writeChunk: chunk => projectChunk(chunk),
        writeTerminalChunk: (chunk, terminalState) => projectChunk(chunk, terminalState),
    }
}

async function createNdjsonStreamResult(
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] },
    execute: (
        options: StreamExecutorOptions,
        executionContext: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] }
    ) => Promise<void>,
    dependencies: ChatServiceDependencies = {}
): Promise<StreamResult> {
    let closed = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let writerRef: ChunkWriter | null = null
    let projector: Pick<StreamEventProjector, 'projectChunk'> | undefined
    let coordinator:
        | (Pick<StreamExecutionCoordinator, 'startExecution'> & Partial<Pick<StreamExecutionCoordinator, 'getCancelRequestedAt'>>)
        | undefined

    const getProjector = () => {
        projector ??= dependencies.streamEventProjector ?? new StreamEventProjector()

        return projector
    }

    const getCoordinator = () => {
        coordinator ??= dependencies.streamExecutionCoordinator ?? new StreamExecutionCoordinator()

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
                const writerOptions = createResumableWriteChunk({
                    context: executionContext,
                    getProjector,
                    writer,
                })
                projectionDrain = writerOptions.drain

                try {
                    await execute(
                        {
                            isClosed: () => isExecutionClosed(executionContext),
                            writeChunk: writerOptions.writeChunk,
                            writeTerminalChunk: writerOptions.writeTerminalChunk,
                        },
                        executionContext
                    )
                } catch (streamError) {
                    const abortLikeError =
                        isAbortError(streamError) || executionContext.signal?.aborted || isExecutionClosed(executionContext)
                    const cancellationRequested =
                        abortLikeError &&
                        executionContext.streamRecovery &&
                        typeof getCoordinator().getCancelRequestedAt === 'function' &&
                        Boolean(
                            await getCoordinator()
                                .getCancelRequestedAt(executionContext.streamRecovery.runId)
                                .catch(() => null)
                        )

                    if (cancellationRequested) {
                        writerOptions.writeTerminalChunk({ type: 'finish' }, 'cancelled')
                        return
                    }

                    if (abortLikeError) {
                        if (executionContext.signal?.aborted || isAbortError(streamError)) {
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
                        writerOptions.writeTerminalChunk(errorChunk, 'failed')
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
                    writerOptions.writeTerminalChunk(runtimeErrorChunk, 'failed')
                } finally {
                    await projectionDrain?.()

                    const projectionError = writerOptions.getProjectionError()

                    if (projectionError && !executionContext.signal?.aborted) {
                        if (projectionError instanceof StreamEventStoreError) {
                            // 不记录 payload，避免把模型输出或运行时数据写入服务端日志。
                            // eslint-disable-next-line no-console
                            console.error('Resumable stream event projection failed:', { code: projectionError.code })
                        }
                        const normalizedProjectionError = normalizeResumeStreamError(projectionError, executionContext)

                        writerOptions.writeTerminalChunk(
                            {
                                errorCode: normalizedProjectionError.code,
                                message: normalizedProjectionError.message,
                                retryable: false,
                                scope: 'runtime',
                                stage: 'runtime',
                                type: 'error',
                            },
                            'failed'
                        )
                        await projectionDrain?.()
                    }

                    closeStream()
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
                if (isAbortError(error) || context.signal?.aborted || isResponseClosed()) {
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

async function createChatStreamResult(
    request: ChatRequest,
    context: ResolvedChatExecutionContext,
    dependencies: ChatServiceDependencies
): Promise<StreamResult> {
    return createNdjsonStreamResult(
        context,
        async ({ isClosed, writeChunk }, executionContext) => {
            const orchestrator = new ChatOrchestrator({
                context: executionContext as ResolvedChatExecutionContext,
                isClosed,
                request,
                writeChunk,
            })

            await orchestrator.run()
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
                writeTerminalChunk({ type: 'finish' }, 'rejected')
            } else {
                lifecycle.emitFinishIfOpen()
            }
        },
        dependencies
    )
}

export function createChatService(dependencies: ChatServiceDependencies = {}) {
    return {
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
