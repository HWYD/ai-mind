/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream } from '@/components/instamind/use-chat-stream'

function createNdjsonResponse() {
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
            },
        }
    )
}

afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
})

describe('useChatStream hydration', () => {
    it('mount 时恢复 hydrated text messages 并同步 reducer snapshot', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            if (String(input) === '/api/chat/thread') {
                return Promise.resolve(
                    Response.json({
                        rawCheckpoint: {
                            should: 'be ignored',
                        },
                        threadId: `chat:${'a'.repeat(64)}`,
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
                                parts: [{ type: 'text', text: '刷新前回答', format: 'markdown' }],
                                createdAt: '2026-07-02T10:00:01.000Z',
                                status: 'completed',
                            },
                            {
                                id: 'hydrated-tool',
                                role: 'assistant',
                                parts: [{ type: 'tool', toolName: 'raw-tool', status: 'completed', input: '{}', output: '{}' }],
                                createdAt: '2026-07-02T10:00:02.000Z',
                                status: 'completed',
                            },
                        ],
                        pinnedDecisions: [],
                        restored: true,
                    })
                )
            }

            return Promise.resolve(createNdjsonResponse())
        })

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(2)
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/chat/thread')

        await act(async () => {
            await result.current.sendMessage('继续问')
        })

        const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))

        expect(requestBody.messages[0]).toMatchObject({
            role: 'user',
            parts: [expect.objectContaining({ text: '刷新前问题' })],
        })
    })

    it('empty restore 保持空消息列表', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                Response.json({
                    threadId: `chat:${'a'.repeat(64)}`,
                    messages: [],
                    pinnedDecisions: [],
                    restored: false,
                })
            )
        )

        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await waitFor(() => {
            expect(result.current.messages).toHaveLength(0)
        })
    })
})
