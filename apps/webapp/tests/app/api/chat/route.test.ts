import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamChatMock = vi.hoisted(() => vi.fn())
const rateLimitCheckAndIncrementMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: vi.fn() })))
const createConversationMock = vi.hoisted(() => vi.fn())
const getConversationMock = vi.hoisted(() => vi.fn())
const touchConversationMock = vi.hoisted(() => vi.fn())

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

import { POST } from '@/app/api/chat/route'

function createPostRequest(payload: unknown) {
    return new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
            'Content-Type': 'application/json',
        },
    })
}

function createUserPayload(overrides: Record<string, unknown> = {}) {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: '你好',
                    },
                ],
            },
        ],
        ...overrides,
    }
}

function createStreamResponse() {
    return new Response('ok', {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
        },
    })
}

describe('POST /api/chat', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createConversationMock.mockResolvedValue({
            selectedConversationId: 'draft-created-conversation',
            conversations: [],
            updatedAt: '2026-07-05T10:00:00.000Z',
        })
        getConversationMock.mockResolvedValue({
            id: 'test-conversation',
            title: '已存在会话',
        })
        touchConversationMock.mockResolvedValue(undefined)
    })

    it('passes resolved model selection and validated conversation ownership to chat service', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(createStreamResponse())

        const payload = createUserPayload({
            options: {
                modelId: 'ollama/qwen3-8b',
            },
        })

        const response = await POST(createPostRequest(payload))

        expect(response.status).toBe(200)
        expect(streamChatMock).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({
                resolvedModelSelection: expect.objectContaining({
                    modelId: 'ollama/qwen3-8b',
                    provider: 'ollama',
                    providerModel: 'qwen3:8b',
                    routeType: 'chat',
                }),
                validatedConversationId: 'test-conversation',
            })
        )
        expect(getConversationMock).toHaveBeenCalledWith('test-session', 'test-conversation')
        expect(createConversationMock).not.toHaveBeenCalled()
        expect(touchConversationMock).toHaveBeenCalledWith(
            'test-session',
            'test-conversation',
            expect.objectContaining({
                markSelected: true,
                userText: '你好',
            })
        )
        expect(response.headers.get('X-AI-Mind-Conversation-Id')).toBe('test-conversation')
    })

    it('creates and validates a persisted conversation for the draft-promotion path', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(createStreamResponse())

        const response = await POST(
            createPostRequest({
                createConversation: true,
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '你好' }],
                    },
                ],
            })
        )

        expect(response.status).toBe(200)
        expect(createConversationMock).toHaveBeenCalledWith(
            'test-session',
            expect.objectContaining({
                hasMessages: true,
                userText: '你好',
            })
        )
        expect(getConversationMock).not.toHaveBeenCalled()
        expect(touchConversationMock).not.toHaveBeenCalled()
        expect(streamChatMock).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'draft-created-conversation',
            }),
            expect.objectContaining({
                validatedConversationId: 'draft-created-conversation',
            })
        )
        expect(response.headers.get('X-AI-Mind-Conversation-Id')).toBe('draft-created-conversation')
    })

    it('draft 首条记忆请求只把 persisted conversationId 传给 runtime', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(createStreamResponse())

        const response = await POST(
            createPostRequest({
                createConversation: true,
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '记住我不吃香菜。' }],
                    },
                ],
            })
        )

        expect(response.status).toBe(200)
        expect(createConversationMock.mock.invocationCallOrder[0]).toBeLessThan(streamChatMock.mock.invocationCallOrder[0])
        expect(streamChatMock).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'draft-created-conversation',
            }),
            expect.objectContaining({
                sessionId: 'test-session',
                validatedConversationId: 'draft-created-conversation',
            })
        )
        expect(streamChatMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: '__draft__',
            }),
            expect.anything()
        )
    })

    it('draft promotion 没有返回 persisted conversationId 时不会继续调用 runtime', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        createConversationMock.mockResolvedValueOnce({
            selectedConversationId: '',
            conversations: [],
            updatedAt: '2026-07-05T10:00:00.000Z',
        })

        const response = await POST(
            createPostRequest({
                createConversation: true,
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '记住我喜欢吃桃子。' }],
                    },
                ],
            })
        )
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toEqual({
            code: 'RUNTIME_INVARIANT_FAILED',
            error: 'Internal server error',
        })
        expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('draft 首条请求在前置校验被拒绝时不会创建 conversation 或进入 runtime', async () => {
        const response = await POST(
            createPostRequest({
                createConversation: true,
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '记住我喜欢吃桃子。' }],
                    },
                ],
                options: {
                    modelId: 'unknown/model',
                },
            })
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('MODEL_NOT_FOUND')
        expect(createConversationMock).not.toHaveBeenCalled()
        expect(streamChatMock).not.toHaveBeenCalled()
    })

    it('draft 首条请求被取消时返回 499，并保持 persisted conversationId 边界', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockRejectedValueOnce(Object.assign(new Error('Request cancelled'), { name: 'AbortError' }))

        const response = await POST(
            createPostRequest({
                createConversation: true,
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '记住我不吃香菜。' }],
                    },
                ],
            })
        )
        const body = await response.json()

        expect(response.status).toBe(499)
        expect(body).toEqual({
            code: 'REQUEST_ABORTED',
            error: 'Request cancelled',
        })
        expect(streamChatMock).toHaveBeenCalledWith(
            expect.objectContaining({
                conversationId: 'draft-created-conversation',
            }),
            expect.objectContaining({
                validatedConversationId: 'draft-created-conversation',
            })
        )
    })

    it('fails invalid model selection before rate limit consumption', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    options: {
                        modelId: 'unknown/model',
                    },
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('MODEL_NOT_FOUND')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
        expect(getConversationMock).not.toHaveBeenCalled()
        expect(createConversationMock).not.toHaveBeenCalled()
    })

    it('fails oversized input before rate limit consumption', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    messages: [
                        {
                            role: 'user',
                            parts: [
                                {
                                    type: 'text',
                                    format: 'markdown',
                                    text: 'a'.repeat(12001),
                                },
                            ],
                        },
                    ],
                    options: {
                        modelId: 'ollama/qwen3-8b',
                    },
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('MODEL_PROVIDER_INVALID_REQUEST')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
        expect(getConversationMock).not.toHaveBeenCalled()
        expect(createConversationMock).not.toHaveBeenCalled()
    })

    it('validates only the latest user turn for server-authoritative chat memory requests', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(createStreamResponse())

        const payload = createUserPayload({
            conversationId: 'test-history-compatible',
            messages: [
                {
                    role: 'user',
                    parts: [{ type: 'text', format: 'markdown', text: 'a'.repeat(8000) }],
                },
                {
                    role: 'assistant',
                    parts: [{ type: 'text', format: 'markdown', text: 'b'.repeat(8000) }],
                },
                {
                    role: 'user',
                    parts: [{ type: 'text', format: 'markdown', text: '当前最新问题' }],
                },
            ],
            options: {
                modelId: 'ollama/qwen3-8b',
            },
        })

        await POST(createPostRequest(payload))

        expect(streamChatMock).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({
                resolvedModelSelection: expect.objectContaining({
                    routeType: 'chat',
                }),
            })
        )
        expect(getConversationMock).toHaveBeenCalledWith('test-session', 'test-history-compatible')
    })

    it('returns INVALID_CHAT_REQUEST for malformed payloads', async () => {
        const response = await POST(createPostRequest({}))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
    })

    it('requires either a non-empty conversationId or createConversation=true and does not spend quota when missing', async () => {
        const response = await POST(
            createPostRequest({
                messages: [
                    {
                        role: 'user',
                        parts: [{ type: 'text', format: 'markdown', text: '你好' }],
                    },
                ],
            })
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
    })

    it('rejects blank conversationId and does not spend quota', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    conversationId: '   ',
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
    })

    it('rejects conflicting createConversation and conversationId parameters', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    createConversation: true,
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
    })

    it('returns 404 when the conversation does not belong to the current browser session registry', async () => {
        getConversationMock.mockResolvedValueOnce(null)

        const response = await POST(createPostRequest(createUserPayload()))
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body).toEqual({
            code: 'CONVERSATION_NOT_FOUND',
            error: 'Conversation was not found in the current browser session registry.',
        })
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
        expect(touchConversationMock).not.toHaveBeenCalled()
    })

    it('rejects the legacy options.model field at the request schema boundary', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    options: {
                        model: 'qwen3:8b',
                    },
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
        expect(getConversationMock).not.toHaveBeenCalled()
    })

    it('returns INVALID_SKILL for unsupported explicit skills', async () => {
        const response = await POST(
            createPostRequest(
                createUserPayload({
                    options: {
                        skill: 'non-existent-skill',
                    },
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_SKILL')
        expect(typeof body.error).toBe('string')
    })

    it('returns a localized 429 rate-limit response without touching conversation activity', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: false,
            limitKey: 'session',
            limitValue: 2,
        })

        const response = await POST(
            createPostRequest(
                createUserPayload({
                    options: {
                        modelId: 'ollama/qwen3-8b',
                    },
                })
            )
        )
        const body = await response.json()

        expect(response.status).toBe(429)
        expect(body).toEqual({
            code: 'MODEL_PROVIDER_RATE_LIMITED',
            error: '聊天请求已达到当前会话的当日上限（2 次）。',
            limitKey: 'session',
        })
        expect(touchConversationMock).not.toHaveBeenCalled()
        expect(createConversationMock).not.toHaveBeenCalled()
    })
})
