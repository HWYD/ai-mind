import type { AIMessageChunk } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'

import { toLangChainMessages } from './langchain-message-adapter'
import type { ChatRequest } from './types/chat'
import type { ChatStreamChunk } from './types/stream-chunk'

function getChunkText(chunk: AIMessageChunk): string {
    if (typeof chunk.content === 'string') {
        return chunk.content
    }

    if (!Array.isArray(chunk.content)) {
        return ''
    }

    return chunk.content
        .map(part => {
            if (typeof part === 'string') {
                return part
            }

            if (typeof part === 'object' && part && 'text' in part) {
                return String(part.text)
            }

            return ''
        })
        .join('')
}

function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

function isControllerClosedError(error: unknown): boolean {
    return error instanceof TypeError && error.message.includes('Controller is already closed')
}

function toNdjsonLine(chunk: ChatStreamChunk): string {
    return `${JSON.stringify(chunk)}\n`
}

function logChatCancellation(reason: string) {
    // eslint-disable-next-line no-console
    console.info(`[chat] stream cancelled: ${reason}`)
}

export interface ChatExecutionContext {
    signal?: AbortSignal
}

export interface ChatServiceDependencies {
    defaultModel: string
    baseUrl?: string
}

export function createChatService(deps: ChatServiceDependencies) {
    return {
        // 将 LangChain 的异步流转换为轻量 NDJSON 协议，供前端自定义 hook 增量消费。
        async streamChat(request: ChatRequest, context: ChatExecutionContext) {
            const model = new ChatOllama({
                model: request.options?.model ?? deps.defaultModel,
                baseUrl: deps.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
                temperature: request.options?.temperature ?? 0.3,
                numPredict: request.options?.maxTokens,
                think: request.options?.enableReasoning,
                streaming: true,
            })

            const langChainMessages = toLangChainMessages(request.messages)
            const modelStream = await model.stream(langChainMessages, {
                signal: context.signal,
            })

            const encoder = new TextEncoder()
            const messageId = crypto.randomUUID()
            const partId = crypto.randomUUID()

            let closed = false

            const responseStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    const closeStream = () => {
                        if (closed) {
                            return
                        }

                        closed = true

                        try {
                            controller.close()
                        } catch (error) {
                            if (!isControllerClosedError(error)) {
                                throw error
                            }
                        }
                    }

                    const writeChunk = (chunk: ChatStreamChunk) => {
                        if (closed) {
                            return
                        }

                        try {
                            controller.enqueue(encoder.encode(toNdjsonLine(chunk)))
                        } catch (error) {
                            if (isControllerClosedError(error)) {
                                closed = true
                                return
                            }

                            throw error
                        }
                    }

                    const run = async () => {
                        try {
                            writeChunk({
                                type: 'start',
                                messageId,
                            })
                            writeChunk({
                                type: 'text-start',
                                partId,
                            })

                            for await (const chunk of modelStream) {
                                if (context.signal?.aborted || closed) {
                                    if (context.signal?.aborted) {
                                        logChatCancellation('request aborted by client')
                                    }
                                    return
                                }

                                const text = getChunkText(chunk)

                                if (text) {
                                    writeChunk({
                                        type: 'text-delta',
                                        partId,
                                        delta: text,
                                    })
                                }
                            }

                            if (context.signal?.aborted || closed) {
                                return
                            }

                            writeChunk({
                                type: 'text-end',
                                partId,
                            })
                            writeChunk({
                                type: 'finish',
                            })
                        } catch (streamError) {
                            if (isAbortError(streamError) || context.signal?.aborted || closed) {
                                if (context.signal?.aborted || isAbortError(streamError)) {
                                    logChatCancellation('model stream aborted')
                                }
                                return
                            }

                            writeChunk({
                                type: 'error',
                                message: 'Model streaming failed.',
                            })
                        } finally {
                            closeStream()
                        }
                    }

                    void run().catch(error => {
                        if (isAbortError(error) || context.signal?.aborted || closed) {
                            closeStream()
                            return
                        }
                        // eslint-disable-next-line no-console
                        console.error('Chat stream failed:', error)
                        closeStream()
                    })
                },
                cancel() {
                    logChatCancellation('response stream consumer cancelled')
                    closed = true
                },
            })

            return new Response(responseStream, {
                headers: {
                    'Content-Type': 'application/x-ndjson; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                },
            })
        },
    }
}
