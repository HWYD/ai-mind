import { StreamLifecycle, writeStaticTextPart, writeStreamErrorChunk } from '@ai-mind/stream-core'
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
import type { ChatRequest } from '@/lib/ai/types/chat'

export type { ChatExecutionContext, ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

const STREAM_HEARTBEAT_INTERVAL_MS = 15_000

interface StreamExecutorOptions {
    isClosed: () => boolean
    writeChunk: WriteChunk
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

async function createNdjsonStreamResult(
    context: ChatExecutionContext & { resolvedModelSelection?: ResolvedChatExecutionContext['resolvedModelSelection'] },
    execute: (options: StreamExecutorOptions) => Promise<void>
): Promise<StreamResult> {
    let closed = false
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let writerRef: ChunkWriter | null = null

    const responseStream = new ReadableStream<Uint8Array>({
        start(controller) {
            const writer = createNdjsonChunkWriter(controller)
            writerRef = writer

            const isClosed = () => closed || writer.isClosed()

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
                if (isClosed()) {
                    closeStream()
                    return
                }

                try {
                    writer.writeHeartbeat()
                } catch {
                    closeStream()
                }
            }, STREAM_HEARTBEAT_INTERVAL_MS)

            const run = async () => {
                try {
                    await execute({
                        isClosed,
                        writeChunk: writer.writeChunk,
                    })
                } catch (streamError) {
                    if (isAbortError(streamError) || context.signal?.aborted || isClosed()) {
                        if (context.signal?.aborted || isAbortError(streamError)) {
                            logChatCancellation('model stream aborted')
                        }
                        return
                    }

                    if (isInvalidSkillError(streamError)) {
                        writeStreamErrorChunk(writer.writeChunk, {
                            scope: 'request',
                            errorCode: 'INVALID_SKILL',
                            retryable: false,
                            message: streamError.message,
                        })
                        return
                    }

                    const normalizedRuntimeError = normalizeResumeStreamError(streamError, context)

                    // 兜底收口：任何未在主链内被消费的异常都按 runtime 错误统一下发。
                    writeStreamErrorChunk(writer.writeChunk, {
                        scope: 'runtime',
                        errorCode: normalizedRuntimeError.code,
                        retryable: normalizedRuntimeError.retryable,
                        message: normalizedRuntimeError.message,
                        stage: 'runtime',
                    })
                } finally {
                    closeStream()
                }
            }

            void run().catch(error => {
                if (isAbortError(error) || context.signal?.aborted || isClosed()) {
                    closeStream()
                    return
                }

                // eslint-disable-next-line no-console
                console.error('Chat stream failed:', error)
                writeStreamErrorChunk(writer.writeChunk, {
                    scope: 'runtime',
                    errorCode: 'RUNTIME_INVARIANT_FAILED',
                    retryable: false,
                    message: 'Chat stream failed unexpectedly.',
                    stage: 'runtime',
                })
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

async function createChatStreamResult(request: ChatRequest, context: ResolvedChatExecutionContext): Promise<StreamResult> {
    return createNdjsonStreamResult(context, async ({ isClosed, writeChunk }) => {
        const orchestrator = new ChatOrchestrator({
            context,
            isClosed,
            request,
            writeChunk,
        })

        await orchestrator.run()
    })
}

async function createResumeAgentRunStreamResult(
    input: ResumeAgentRunStreamInput,
    context: ResolvedChatExecutionContext
): Promise<StreamResult> {
    return createNdjsonStreamResult(context, async ({ isClosed, writeChunk }) => {
        const lifecycle = new StreamLifecycle({
            context,
            isClosed,
            writeChunk,
        })

        if (!context.sessionId) {
            throw new Error('Tasklist Agent resume requires an owned chat session.')
        }

        await resumeVersionPlanTasklistAgentRun({
            agentRunService: input.agentRunService,
            context,
            decision: input.decision,
            interruptId: input.interruptId,
            models: input.models,
            preparedResume: input.preparedResume,
            runId: input.runId,
            runtimeConfig: input.runtimeConfig,
            sessionId: context.sessionId,
            userGoal: input.userGoal,
            writeChunk,
        })

        lifecycle.emitFinishIfOpen()
    })
}

async function createRejectAgentRunStreamResult(input: RejectAgentRunStreamInput, context: ChatExecutionContext): Promise<StreamResult> {
    return createNdjsonStreamResult(context, async ({ isClosed, writeChunk }) => {
        const lifecycle = new StreamLifecycle({
            context,
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
        lifecycle.emitFinishIfOpen()
    })
}

export function createChatService() {
    return {
        async rejectAgentRun(input: RejectAgentRunStreamInput, context: ChatExecutionContext) {
            const streamResult = await createRejectAgentRunStreamResult(input, context)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
        async resumeAgentRun(input: ResumeAgentRunStreamInput, context: ResolvedChatExecutionContext) {
            const streamResult = await createResumeAgentRunStreamResult(input, context)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
        async streamChat(request: ChatRequest, context: ResolvedChatExecutionContext) {
            const streamResult = await createChatStreamResult(request, context)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
    }
}
