/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream } from '@/components/instamind/use-chat-stream'

function createThreadHydrationResponse(options: { conversationId: string; messages?: unknown[]; restored?: boolean }) {
    return Response.json({
        conversationId: options.conversationId,
        threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
        messages: options.messages ?? [],
        pinnedDecisions: [],
        restored: options.restored ?? false,
    })
}

function createNdjsonResponse(headers: Record<string, string> = {}) {
    const encoder = new TextEncoder()

    return new Response(
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'start', messageId: 'assistant-next' })}\n`))
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'finish' })}\n`))
                controller.close()
            },
        }),
        {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                ...headers,
            },
        }
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
})

describe('useChatStream hydration', () => {
    it('restores only selected-conversation text messages and reuses them in the next request', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url === '/api/chat/thread?conversationId=conv-a') {
                return Promise.resolve(
                    createThreadHydrationResponse({
                        conversationId: 'conv-a',
                        restored: true,
                        messages: [
                            {
                                id: 'hydrated-user',
                                role: 'user',
                                parts: [{ type: 'text', text: '刷新前问题', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:00.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'hydrated-assistant',
                                role: 'assistant',
                                parts: [{ type: 'text', text: '刷新前 tool final answer', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:01.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'hydrated-tasklist',
                                role: 'assistant',
                                parts: [{ type: 'text', text: '刷新前 tasklist 最终摘要', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:02.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'hydrated-tool',
                                role: 'assistant',
                                parts: [{ type: 'tool', toolName: 'raw-tool', status: 'completed', input: '{}', output: '{}' }],
                                createdAt: '2026-07-02T10:00:03.000Z',
                                status: 'completed',
                            },
                        ],
                    })
                )
            }

            return Promise.resolve(createNdjsonResponse())
        })

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useChatStream({ conversationId: 'conv-a', enableReasoning: false }))

        expect(result.current.hydrationStatus).toBe('loading')

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(3)
        })

        expect(result.current.hydrationStatus).toBe('ready')

        await act(async () => {
            await result.current.sendMessage('继续问')
        })

        const chatRequest = fetchMock.mock.calls.find(call => String(call[0]) === '/api/chat')
        const requestBody = JSON.parse(String((chatRequest?.[1] as RequestInit | undefined)?.body))

        expect(fetchMock).toHaveBeenCalledWith('/api/chat/thread?conversationId=conv-a')
        expect(requestBody.conversationId).toBe('conv-a')
        expect(requestBody.messages[0]).toMatchObject({
            role: 'user',
            parts: [expect.objectContaining({ text: '刷新前问题' })],
        })
        expect(requestBody.messages[1]).toMatchObject({
            role: 'assistant',
            parts: [expect.objectContaining({ text: '刷新前 tool final answer' })],
        })
        expect(requestBody.messages[2]).toMatchObject({
            role: 'assistant',
            parts: [expect.objectContaining({ text: '刷新前 tasklist 最终摘要' })],
        })
    })

    it('switches hydration to the newly selected conversation only', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url === '/api/chat/thread?conversationId=conv-a') {
                return Promise.resolve(
                    createThreadHydrationResponse({
                        conversationId: 'conv-a',
                        restored: true,
                        messages: [
                            {
                                id: 'conv-a-user',
                                role: 'user',
                                parts: [{ type: 'text', text: 'A 问题', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:00.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'conv-a-assistant',
                                role: 'assistant',
                                parts: [{ type: 'text', text: 'A 回答', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:01.000Z',
                                status: 'completed',
                            },
                        ],
                    })
                )
            }

            if (url === '/api/chat/thread?conversationId=conv-b') {
                return Promise.resolve(
                    createThreadHydrationResponse({
                        conversationId: 'conv-b',
                        restored: true,
                        messages: [
                            {
                                id: 'conv-b-user',
                                role: 'user',
                                parts: [{ type: 'text', text: 'B 问题', format: 'markdown' }],
                                createdAt: '2026-07-02T10:01:00.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'conv-b-assistant',
                                role: 'assistant',
                                parts: [{ type: 'text', text: 'B 回答', format: 'markdown' }],
                                createdAt: '2026-07-02T10:01:01.000Z',
                                status: 'completed',
                            },
                        ],
                    })
                )
            }

            return Promise.resolve(createNdjsonResponse())
        })

        vi.stubGlobal('fetch', fetchMock)

        const { result, rerender } = renderHook(({ conversationId }) => useChatStream({ conversationId, enableReasoning: false }), {
            initialProps: {
                conversationId: 'conv-a',
            },
        })

        await waitFor(() => {
            expect(result.current.messages[0]?.id).toBe('conv-a-user')
        })

        expect(result.current.hydrationStatus).toBe('ready')

        rerender({
            conversationId: 'conv-b',
        })

        expect(result.current.hydrationStatus).toBe('loading')

        await waitFor(() => {
            expect(result.current.messages[0]?.id).toBe('conv-b-user')
        })

        expect(result.current.messages.map(message => message.id)).toEqual(['conv-b-user', 'conv-b-assistant'])
        expect(result.current.hydrationStatus).toBe('ready')
        expect(fetchMock.mock.calls.filter(call => String(call[0]).startsWith('/api/chat/thread'))).toEqual([
            ['/api/chat/thread?conversationId=conv-a'],
            ['/api/chat/thread?conversationId=conv-b'],
        ])
    })

    it('keeps an empty message list and does not request persisted hydration while in blank draft state', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createNdjsonResponse({
                'X-AI-Mind-Conversation-Id': 'promoted-conversation',
            })
        )
        const onConversationPromoted = vi.fn()

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() =>
            useChatStream({
                draftMode: true,
                enableReasoning: false,
                onConversationPromoted,
            })
        )

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(0)
        })

        expect(result.current.hydrationStatus).toBe('idle')
        expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/chat/thread'))

        await act(async () => {
            await result.current.sendMessage('从草稿发送首条消息')
        })

        const chatRequest = fetchMock.mock.calls.find(call => String(call[0]) === '/api/chat')
        const requestBody = JSON.parse(String((chatRequest?.[1] as RequestInit | undefined)?.body))

        expect(requestBody).toMatchObject({
            createConversation: true,
        })
        expect(requestBody.conversationId).toBeUndefined()
        await waitFor(() => {
            expect(onConversationPromoted).toHaveBeenCalledWith('promoted-conversation')
        })
    })

    it('surfaces hydration failure and retries the selected conversation on demand', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(
                createThreadHydrationResponse({
                    conversationId: 'conv-retry',
                    restored: true,
                    messages: [
                        {
                            id: 'retry-user',
                            role: 'user',
                            parts: [{ type: 'text', text: '恢复后的问题', format: 'markdown' }],
                            createdAt: '2026-07-02T10:02:00.000Z',
                            status: 'completed',
                        },
                    ],
                })
            )

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useChatStream({ conversationId: 'conv-retry', enableReasoning: false }))

        await waitFor(() => {
            expect(result.current.hydrationStatus).toBe('failed')
        })

        expect(result.current.hydrationError).toBe('会话加载失败，请重试。')
        expect(result.current.messages).toHaveLength(0)

        act(() => {
            expect(result.current.retryHydration()).toBe(true)
        })

        await waitFor(() => {
            expect(result.current.hydrationStatus).toBe('ready')
        })

        expect(result.current.messages[0]?.id).toBe('retry-user')
        expect(fetchMock.mock.calls).toEqual([
            ['/api/chat/thread?conversationId=conv-retry'],
            ['/api/chat/thread?conversationId=conv-retry'],
        ])
    })
})
