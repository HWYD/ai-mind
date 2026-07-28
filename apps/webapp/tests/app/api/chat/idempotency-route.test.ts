import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamChatMock = vi.hoisted(() => vi.fn())
const rateLimitCheckAndIncrementMock = vi.hoisted(() => vi.fn())
const rateLimitRollbackMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: vi.fn() })))
const getConversationMock = vi.hoisted(() => vi.fn())
const touchConversationMock = vi.hoisted(() => vi.fn())
const streamRunMocks = vi.hoisted(() => {
    class MockStreamRunServiceError extends Error {
        readonly code: string

        constructor(code: string, message: string) {
            super(message)
            this.name = 'StreamRunServiceError'
            this.code = code
        }
    }

    return {
        createOrReuseRunMock: vi.fn(),
        hasReusableRequestMock: vi.fn(),
        MockStreamRunServiceError,
    }
})

vi.mock('@/lib/ai/chat-service', () => ({
    createChatService: () => ({
        streamChat: streamChatMock,
    }),
}))

vi.mock('@/lib/ai/runtime/chat-memory', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/chat-memory')>()

    return {
        ...actual,
        conversationRegistryService: {
            ...actual.conversationRegistryService,
            getConversation: getConversationMock,
            touchConversation: touchConversationMock,
        },
    }
})

vi.mock('@/lib/ai/rate-limit', () => ({
    getRateLimitConfig: () => ({
        chatDailyLimitPerIp: 10,
        chatDailyLimitPerSession: 10,
        enabled: true,
        tasklistDailyLimitPerIp: 10,
        tasklistDailyLimitPerSession: 10,
    }),
    MemoryRateLimitStore: class MemoryRateLimitStoreMock {
        checkAndIncrement = rateLimitCheckAndIncrementMock
        rollback = rateLimitRollbackMock
    },
    resolveClientIp: () => '127.0.0.1',
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/stream-recovery/stream-run-service', () => ({
    StreamRunService: class StreamRunServiceMock {
        createOrReuseRun = streamRunMocks.createOrReuseRunMock
        hasReusableRequest = streamRunMocks.hasReusableRequestMock
    },
    StreamRunServiceError: streamRunMocks.MockStreamRunServiceError,
}))

import { POST } from '@/app/api/chat/route'

function createPostRequest(payload: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost:3000/api/chat', {
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        method: 'POST',
    })
}

function createUserPayload(message = 'hello') {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                parts: [
                    {
                        format: 'markdown',
                        text: message,
                        type: 'text',
                    },
                ],
                role: 'user',
            },
        ],
        options: {
            modelId: 'ollama/qwen3-8b',
        },
    }
}

function createStreamHeaders(key = 'client-key-1') {
    return {
        'Idempotency-Key': key,
    }
}

describe('POST /api/chat idempotency route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        rateLimitCheckAndIncrementMock.mockReturnValue({
            allowed: true,
        })
        rateLimitRollbackMock.mockReset()
        streamRunMocks.hasReusableRequestMock.mockResolvedValue(false)
        getConversationMock.mockResolvedValue({
            id: 'test-conversation',
            title: 'Existing conversation',
        })
        touchConversationMock.mockResolvedValue(undefined)
        streamChatMock.mockResolvedValue(new Response('ok'))
    })

    it('returns one initial stream and replay descriptors for concurrent duplicate POSTs', async () => {
        let created = false
        streamRunMocks.createOrReuseRunMock.mockImplementation(async () => {
            if (!created) {
                created = true

                return {
                    request: {
                        id: 'request_1',
                        runId: 'run_1',
                    },
                    run: {
                        id: 'run_1',
                    },
                    streamUrl: '/api/chat/runs/run_1/stream',
                    type: 'created',
                }
            }

            return {
                descriptor: {
                    kind: 'stream-replay',
                    lastSequence: 0,
                    replayed: true,
                    runId: 'run_1',
                    status: 'running',
                    streamUrl: '/api/chat/runs/run_1/stream',
                },
                request: {
                    id: 'request_1',
                    runId: 'run_1',
                },
                type: 'replay',
            }
        })

        const responses = await Promise.all(
            [1, 2, 3].map(() => POST(createPostRequest(createUserPayload(), createStreamHeaders('same-key'))))
        )

        expect(responses.map(response => response.headers.get('X-Run-Id'))).toEqual(['run_1', 'run_1', 'run_1'])
        expect(responses.filter(response => response.headers.get('Content-Type')?.includes('application/json'))).toHaveLength(2)
        expect(streamChatMock).toHaveBeenCalledTimes(1)
        expect(touchConversationMock).toHaveBeenCalledTimes(1)
        await expect(responses[1]!.json()).resolves.toMatchObject({
            kind: 'stream-replay',
            replayed: true,
            runId: 'run_1',
            streamUrl: '/api/chat/runs/run_1/stream',
        })
    })

    it('returns safe 409 for same idempotency key with a different fingerprint', async () => {
        streamRunMocks.createOrReuseRunMock.mockRejectedValueOnce(
            new streamRunMocks.MockStreamRunServiceError(
                'IDEMPOTENCY_CONFLICT',
                'Idempotency-Key was already used for a different stream request.'
            )
        )

        const response = await POST(createPostRequest(createUserPayload('different'), createStreamHeaders()))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({
            code: 'IDEMPOTENCY_CONFLICT',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'IDEMPOTENCY_CONFLICT',
                retryable: false,
            }),
            error: 'Idempotency-Key was already used for a different stream request.',
        })
        expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('rejects a request without a stable idempotency key', async () => {
        const response = await POST(createPostRequest(createUserPayload()))

        expect(response.status).toBe(400)
        expect(streamRunMocks.createOrReuseRunMock).not.toHaveBeenCalled()
        expect(streamChatMock).not.toHaveBeenCalled()
    })
})
