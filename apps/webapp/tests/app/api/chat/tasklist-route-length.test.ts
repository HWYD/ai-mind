import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamChatMock = vi.hoisted(() => vi.fn())
const rateLimitCheckAndIncrementMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: vi.fn() })))
const getConversationMock = vi.hoisted(() => vi.fn())
const touchConversationMock = vi.hoisted(() => vi.fn())
const createOrReuseRunMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/chat-service', () => ({
    createChatService: () => ({
        streamChat: streamChatMock,
    }),
}))

vi.mock('@/lib/ai/stream-recovery/stream-run-service', () => ({
    StreamRunService: class StreamRunServiceMock {
        createOrReuseRun = createOrReuseRunMock
    },
    StreamRunServiceError: class StreamRunServiceError extends Error {},
}))

vi.mock('@/lib/ai/rate-limit', () => ({
    getRateLimitConfig: () => ({
        chatDailyLimitPerIp: 1,
        chatDailyLimitPerSession: 1,
        enabled: true,
        tasklistDailyLimitPerIp: 1,
        tasklistDailyLimitPerSession: 1,
    }),
    MemoryRateLimitStore: class MemoryRateLimitStoreMock {
        checkAndIncrement = rateLimitCheckAndIncrementMock
    },
    resolveClientIp: () => '127.0.0.1',
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/runtime/chat-memory', () => ({
    conversationRegistryService: {
        getConversation: getConversationMock,
        touchConversation: touchConversationMock,
    },
}))

import { POST } from '@/app/api/chat/route'

function createPostRequest(payload: unknown) {
    return new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'tasklist-route-length-key',
        },
    })
}

describe('POST /api/chat tasklist input length routing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        getConversationMock.mockResolvedValue({
            id: 'test-tasklist-history-length',
        })
        touchConversationMock.mockResolvedValue(undefined)
        createOrReuseRunMock.mockResolvedValue({
            request: { id: 'request-tasklist-test' },
            run: { id: 'run-tasklist-test' },
            streamUrl: '/api/chat/runs/run-tasklist-test/stream',
            type: 'created',
        })
    })

    it('does not reject tasklist requests only because prior history is too long', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(new Response('ok'))

        const payload = {
            conversationId: 'test-tasklist-history-length',
            composer: {
                plainText: '  ',
                command: {
                    name: 'tasklist',
                    label: '生成任务清单',
                },
                references: [
                    {
                        id: 'demo:version-plan:v034-langsmith-observability.md',
                        type: 'resource',
                        label: 'v034-langsmith-observability.md',
                        uri: 'demo://version-plans/v034-langsmith-observability.md',
                        source: 'local',
                    },
                ],
            },
            messages: [
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: 'a'.repeat(12001),
                        },
                    ],
                },
                {
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: '生成任务清单 @v034-langsmith-observability.md',
                        },
                    ],
                },
            ],
            options: {
                modelId: 'qwen/qwen3.6-flash',
            },
        }

        const response = await POST(createPostRequest(payload))

        expect(response.status).toBe(200)
        expect(streamChatMock).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({
                resolvedModelSelection: expect.objectContaining({
                    routeType: 'tasklist',
                }),
            })
        )
        expect(getConversationMock).toHaveBeenCalledWith('test-session', 'test-tasklist-history-length')
        expect(touchConversationMock).toHaveBeenCalledWith(
            'test-session',
            'test-tasklist-history-length',
            expect.objectContaining({
                markSelected: true,
            })
        )
    })
})
