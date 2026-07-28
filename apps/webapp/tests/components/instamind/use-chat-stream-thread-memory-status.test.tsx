/** @vitest-environment jsdom */

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream as useChatStreamBase } from '@/components/instamind/use-chat-stream'

const TEST_CONVERSATION_ID = 'conv-memory-status'

function useChatStream() {
    return useChatStreamBase({
        conversationId: TEST_CONVERSATION_ID,
        enableReasoning: false,
    })
}

function createNdjsonResponse(chunks: ChatStreamChunk[], runId = 'run-memory-status') {
    const encoder = new TextEncoder()

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const [index, chunk] of chunks.entries()) {
                const terminal = chunk.type === 'finish'
                controller.enqueue(
                    encoder.encode(
                        `${JSON.stringify({ protocolVersion: 1, eventId: `${runId}-${index + 1}`, runId, sequence: index + 1, eventKind: terminal ? 'terminal' : 'chunk', payload: chunk, ...(terminal ? { terminal: true, terminalState: 'completed', runStatus: 'completed' } : {}) })}\n`
                    )
                )
            }

            controller.close()
        },
    })

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'X-Run-Id': runId,
        },
    })
}

function createThreadHydrationResponse() {
    return Response.json({
        conversationId: TEST_CONVERSATION_ID,
        threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
        messages: [],
        pinnedDecisions: [],
        restored: false,
    })
}

function getChatFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(call => !String(call[0]).startsWith('/api/chat/thread'))
}

function withThreadHydration(chatResponse: ReturnType<typeof vi.fn>) {
    return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/chat/thread')) {
            return Promise.resolve(createThreadHydrationResponse())
        }

        return Promise.resolve(
            (chatResponse as (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>)(input, init)
        )
    })
}

afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    cleanup()
})

describe('useChatStream thread-memory status', () => {
    it('preserves the latest hint and writes the status into the assistant message', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-memory-status' },
            { type: 'text-start', partId: 'text-memory-status' },
            { type: 'text-delta', partId: 'text-memory-status', delta: '这是本轮回答。' },
            { type: 'text-end', partId: 'text-memory-status' },
            {
                type: 'thread-memory-status',
                status: 'started',
                message: '自动压缩上下文中',
            },
            {
                type: 'thread-memory-status',
                status: 'succeeded',
                message: '上下文已自动压缩',
                pinnedDecisionCount: 1,
                summaryLength: 32,
            },
            { type: 'finish' },
        ]

        const fetchMock = vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks))

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.sendMessage('继续聊')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.id === 'assistant-memory-status')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')
        const threadMemoryStatusPart = assistantMessage?.parts.find(part => part.type === 'thread-memory-status')

        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toBe('这是本轮回答。')
        expect(threadMemoryStatusPart).toMatchObject({
            type: 'thread-memory-status',
            status: 'succeeded',
            message: '上下文已自动压缩',
            pinnedDecisionCount: 1,
            summaryLength: 32,
        })
        expect(result.current.threadMemoryStatusHint).toEqual({
            status: 'succeeded',
            message: '上下文已自动压缩',
            pinnedDecisionCount: 1,
            summaryLength: 32,
        })
        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
    })

    it('clears the previous persisted hint before the next turn starts', async () => {
        let chatRequestCount = 0
        const fetchMock = vi.fn().mockImplementation(() => {
            chatRequestCount += 1

            if (chatRequestCount === 1) {
                return Promise.resolve(
                    createNdjsonResponse([
                        { type: 'start', messageId: 'assistant-memory-failed' },
                        { type: 'finish' },
                        {
                            type: 'thread-memory-status',
                            status: 'failed',
                            message: '上下文自动压缩失败',
                        },
                    ])
                )
            }

            return Promise.resolve(createNdjsonResponse([{ type: 'start', messageId: 'assistant-next' }, { type: 'finish' }]))
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream())

        await act(async () => {
            await result.current.sendMessage('第一轮')
        })

        await waitFor(() => {
            expect(result.current.threadMemoryStatusHint?.status).toBe('failed')
        })

        await act(async () => {
            void result.current.sendMessage('第二轮')
        })

        expect(result.current.threadMemoryStatusHint).toBeNull()

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(2)
        expect(result.current.threadMemoryStatusHint).toBeNull()
    })

    it('clears the previous hint when switching to another conversation', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url === '/api/chat/thread?conversationId=conv-a') {
                return Promise.resolve(
                    Response.json({
                        conversationId: 'conv-a',
                        threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
                        messages: [],
                        pinnedDecisions: [],
                        restored: false,
                    })
                )
            }

            if (url === '/api/chat/thread?conversationId=conv-b') {
                return Promise.resolve(
                    Response.json({
                        conversationId: 'conv-b',
                        threadId: `chat-conversation:${'c'.repeat(64)}:${'d'.repeat(64)}`,
                        messages: [],
                        pinnedDecisions: [],
                        restored: false,
                    })
                )
            }

            return Promise.resolve(
                createNdjsonResponse([
                    { type: 'start', messageId: 'assistant-switch' },
                    {
                        type: 'thread-memory-status',
                        status: 'succeeded',
                        message: '涓婁笅鏂囧凡鑷姩鍘嬬缉',
                        pinnedDecisionCount: 1,
                        summaryLength: 24,
                    },
                    { type: 'finish' },
                ])
            )
        })

        vi.stubGlobal('fetch', fetchMock)

        const { result, rerender } = renderHook(
            ({ conversationId }) =>
                useChatStreamBase({
                    conversationId,
                    enableReasoning: false,
                }),
            {
                initialProps: {
                    conversationId: 'conv-a',
                },
            }
        )

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        await act(async () => {
            await result.current.sendMessage('绗竴涓細璇濊姹?')
        })

        await waitFor(() => {
            expect(result.current.threadMemoryStatusHint?.status).toBe('succeeded')
        })

        rerender({
            conversationId: 'conv-b',
        })

        expect(result.current.threadMemoryStatusHint).toBeNull()

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith('/api/chat/thread?conversationId=conv-b')
        })
        expect(result.current.threadMemoryStatusHint).toBeNull()
    })
})
