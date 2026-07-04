/** @vitest-environment jsdom */

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream } from '@/components/instamind/use-chat-stream'

function createNdjsonResponse(chunks: ChatStreamChunk[]) {
    const encoder = new TextEncoder()

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`))
            }

            controller.close()
        },
    })

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
        },
    })
}

function getChatFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(call => String(call[0]) !== '/api/chat/thread')
}

afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    cleanup()
})

describe('useChatStream thread-memory status', () => {
    it('preserves the compaction hint and also writes the status into the assistant message', async () => {
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

        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((input: RequestInfo | URL) => {
                if (String(input) === '/api/chat/thread') {
                    return Promise.resolve(
                        Response.json({
                            threadId: `chat:${'a'.repeat(64)}`,
                            messages: [],
                            pinnedDecisions: [],
                            restored: false,
                        })
                    )
                }

                return Promise.resolve(createNdjsonResponse(streamChunks))
            })
        )
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

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
    })

    it('clears the previous persisted compaction hint before the next turn starts', async () => {
        let chatRequestCount = 0
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            if (String(input) === '/api/chat/thread') {
                return Promise.resolve(
                    Response.json({
                        threadId: `chat:${'a'.repeat(64)}`,
                        messages: [],
                        pinnedDecisions: [],
                        restored: false,
                    })
                )
            }

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

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

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
})
