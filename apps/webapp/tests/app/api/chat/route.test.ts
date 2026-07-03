import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamChatMock = vi.hoisted(() => vi.fn())
const rateLimitCheckAndIncrementMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: vi.fn() })))

vi.mock('@/lib/ai/chat-service', () => ({
    createChatService: () => ({
        streamChat: streamChatMock,
    }),
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

describe('POST /api/chat', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('合法请求会在 route 层解析 resolvedModelSelection 后传给 chat service', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(new Response('ok'))

        const payload = {
            conversationId: 'test-valid-model',
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
            options: {
                modelId: 'ollama/qwen3-8b',
            },
        }

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
            })
        )
    })

    it('无效 modelId 会在限流前失败，不会消耗 quota', async () => {
        const payload = {
            conversationId: 'test-invalid-model',
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
            options: {
                modelId: 'unknown/model',
            },
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('MODEL_NOT_FOUND')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
    })

    it('超长输入会在限流前失败，不会消耗 quota', async () => {
        const payload = {
            conversationId: 'test-input-length',
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
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('MODEL_PROVIDER_INVALID_REQUEST')
        expect(rateLimitCheckAndIncrementMock).not.toHaveBeenCalled()
    })

    it('普通 chat memory 路径只校验最新 user 输入，不因前端历史 payload 过长而拦截', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: true,
        })
        streamChatMock.mockResolvedValueOnce(new Response('ok'))

        const payload = {
            conversationId: 'test-server-authoritative-input-length',
            messages: [
                {
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: 'a'.repeat(8000),
                        },
                    ],
                },
                {
                    role: 'assistant',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: 'b'.repeat(8000),
                        },
                    ],
                },
                {
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            format: 'markdown',
                            text: '当前最新问题',
                        },
                    ],
                },
            ],
            options: {
                modelId: 'ollama/qwen3-8b',
            },
        }

        const response = await POST(createPostRequest(payload))

        expect(response.status).toBe(200)
        expect(streamChatMock).toHaveBeenCalledWith(
            payload,
            expect.objectContaining({
                resolvedModelSelection: expect.objectContaining({
                    routeType: 'chat',
                }),
            })
        )
    })

    it('非法请求体会返回 400 + INVALID_CHAT_REQUEST', async () => {
        const response = await POST(createPostRequest({}))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
    })

    it('旧 options.model 会返回 400 + INVALID_CHAT_REQUEST', async () => {
        const payload = {
            conversationId: 'test-legacy-model-field',
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
            options: {
                model: 'qwen3:8b',
            },
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CHAT_REQUEST')
    })

    it('非法 skill 会返回 400 + INVALID_SKILL', async () => {
        const payload = {
            conversationId: 'test-invalid-skill',
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
            options: {
                skill: 'non-existent-skill',
            },
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_SKILL')
        expect(typeof body.error).toBe('string')
    })

    it('限流时返回中文错误文案和 429', async () => {
        rateLimitCheckAndIncrementMock.mockReturnValueOnce({
            allowed: false,
            limitKey: 'session',
            limitValue: 2,
        })

        const payload = {
            conversationId: 'test-rate-limited',
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
            options: {
                modelId: 'ollama/qwen3-8b',
            },
        }

        const response = await POST(createPostRequest(payload))
        const body = await response.json()

        expect(response.status).toBe(429)
        expect(body).toEqual({
            code: 'MODEL_PROVIDER_RATE_LIMITED',
            error: '聊天请求已达到当前会话的当日上限（2 次）。',
            limitKey: 'session',
        })
    })
})
