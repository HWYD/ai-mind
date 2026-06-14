import { writeStreamErrorChunk } from '@ai-mind/stream-core'
import { type ChunkWriter, createNdjsonChunkWriter } from '@ai-mind/stream-core/web'

import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'
import { logChatCancellation } from '@/lib/ai/runtime/stream-errors'
import type { ResolvedChatExecutionContext, StreamResult } from '@/lib/ai/runtime/types'
import type { ChatRequest } from '@/lib/ai/types/chat'

export type { ChatExecutionContext, ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

async function createChatStreamResult(request: ChatRequest, context: ResolvedChatExecutionContext): Promise<StreamResult> {
    let closed = false
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
                writer.close()
            }

            const run = async () => {
                try {
                    const orchestrator = new ChatOrchestrator({
                        context,
                        isClosed,
                        request,
                        writeChunk: writer.writeChunk,
                    })

                    await orchestrator.run()
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

                    // 兜底收口：任何未在主链内被消费的异常都按 runtime 错误统一下发。
                    writeStreamErrorChunk(writer.writeChunk, {
                        scope: 'runtime',
                        errorCode: 'MODEL_STREAM_FAILED',
                        retryable: true,
                        message: 'Model streaming failed.',
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
            writerRef?.close()
        },
    })

    const headers: Record<string, string> = {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
    }

    if (context.setCookie) {
        headers['Set-Cookie'] = context.setCookie
    }

    return {
        body: responseStream,
        headers,
    }
}

export function createChatService() {
    return {
        async streamChat(request: ChatRequest, context: ResolvedChatExecutionContext) {
            const streamResult = await createChatStreamResult(request, context)

            return new Response(streamResult.body, {
                headers: streamResult.headers,
            })
        },
    }
}
