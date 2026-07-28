import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamChatMock = vi.hoisted(() => vi.fn())
const rateLimitCheckAndIncrementMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: vi.fn() })))
const getConversationMock = vi.hoisted(() => vi.fn())
const touchConversationMock = vi.hoisted(() => vi.fn())
const createConversationMock = vi.hoisted(() => vi.fn())
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
            createConversation: createConversationMock,
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
    },
    resolveClientIp: () => '127.0.0.1',
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/stream-recovery/stream-run-service', () => ({
    StreamRunService: class StreamRunServiceMock {
        createOrReuseRun = streamRunMocks.createOrReuseRunMock
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

function createUserPayload() {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                parts: [
                    {
                        format: 'markdown',
                        text: 'hello',
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

function createStreamResponse() {
    return new Response('ok', {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
        },
    })
}

describe('POST /api/chat resumable stream contract', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        rateLimitCheckAndIncrementMock.mockReturnValue({
            allowed: true,
        })
        getConversationMock.mockResolvedValue({
            id: 'test-conversation',
            title: 'Existing conversation',
        })
        touchConversationMock.mockResolvedValue(undefined)
        streamChatMock.mockResolvedValue(createStreamResponse())
    })

    it('creates a resumable StreamRun before every initial NDJSON execution and returns run headers', async () => {
        streamRunMocks.createOrReuseRunMock.mockResolvedValueOnce({
            request: {
                id: 'request_1',
            },
            run: {
                id: 'run_1',
            },
            streamUrl: '/api/chat/runs/run_1/stream',
            type: 'created',
        })

        const response = await POST(
            createPostRequest(createUserPayload(), {
                'Idempotency-Key': 'client-key-1',
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('X-Run-Id')).toBe('run_1')
        expect(response.headers.get('X-Stream-Protocol')).toBe('ai-mind-resumable-v1')
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson; profile="ai-mind-resumable-v1"')
        expect(streamRunMocks.createOrReuseRunMock).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: 'client-key-1',
                kind: 'chat',
                ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                request: expect.objectContaining({
                    conversationId: 'test-conversation',
                }),
            })
        )
        expect(streamChatMock).toHaveBeenCalledTimes(1)
        expect(streamChatMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                signal: undefined,
                streamRecovery: expect.objectContaining({
                    ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                    requestSignal: expect.any(AbortSignal),
                    runId: 'run_1',
                }),
            })
        )
    })

    it('returns a fixed-envelope stream when the request does not send an Accept profile', async () => {
        streamRunMocks.createOrReuseRunMock.mockResolvedValueOnce({
            request: { id: 'request_1' },
            run: { id: 'run_1' },
            streamUrl: '/api/chat/runs/run_1/stream',
            type: 'created',
        })

        const response = await POST(createPostRequest(createUserPayload(), { 'Idempotency-Key': 'client-key-1' }))

        expect(response.status).toBe(200)
        expect(response.headers.get('X-Run-Id')).toBe('run_1')
        expect(response.headers.get('X-Stream-Protocol')).toBe('ai-mind-resumable-v1')
        expect(streamRunMocks.createOrReuseRunMock).toHaveBeenCalledTimes(1)
        expect(streamChatMock).toHaveBeenCalledTimes(1)
    })

    it('returns JSON replay descriptor for duplicate POST and does not start another execution', async () => {
        streamRunMocks.createOrReuseRunMock.mockResolvedValueOnce({
            descriptor: {
                kind: 'stream-replay',
                lastSequence: 42,
                replayed: true,
                runId: 'run_1',
                status: 'running',
                streamUrl: '/api/chat/runs/run_1/stream',
            },
            request: {
                id: 'request_1',
            },
            type: 'replay',
        })

        const response = await POST(
            createPostRequest(createUserPayload(), {
                'Idempotency-Key': 'client-key-1',
            })
        )

        await expect(response.json()).resolves.toEqual({
            kind: 'stream-replay',
            lastSequence: 42,
            replayed: true,
            runId: 'run_1',
            status: 'running',
            streamUrl: '/api/chat/runs/run_1/stream',
        })
        expect(response.headers.get('Content-Type')).toContain('application/json')
        expect(response.headers.get('X-Run-Id')).toBe('run_1')
        expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('rejects every initial POST without Idempotency-Key before entering runtime', async () => {
        const response = await POST(createPostRequest(createUserPayload()))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toMatchObject({
            code: 'INVALID_CHAT_REQUEST',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'INVALID_CHAT_REQUEST',
                retryable: false,
            }),
            error: 'Idempotency-Key is required for chat stream requests.',
        })
        expect(streamRunMocks.createOrReuseRunMock).not.toHaveBeenCalled()
        expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('returns safe conflict response for duplicate key with a different fingerprint', async () => {
        streamRunMocks.createOrReuseRunMock.mockRejectedValueOnce(
            new streamRunMocks.MockStreamRunServiceError(
                'IDEMPOTENCY_CONFLICT',
                'Idempotency-Key was already used for a different stream request.'
            )
        )

        const response = await POST(
            createPostRequest(createUserPayload(), {
                'Idempotency-Key': 'client-key-1',
            })
        )
        const body = await response.json()

        expect(response.status).toBe(409)
        expect(body).toMatchObject({
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
})
