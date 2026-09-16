import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/chat/context-usage/route'
import { buildChatConversationThreadId, chatMemoryService, conversationRegistryService } from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

function createGetRequest(options: { conversationId?: string; modelId?: string; cookie?: string } = {}) {
    const params = new URLSearchParams()

    if (options.conversationId) params.set('conversationId', options.conversationId)
    if (options.modelId) params.set('modelId', options.modelId)

    const query = params.size > 0 ? `?${params.toString()}` : ''

    return new NextRequest(`http://localhost:3000/api/chat/context-usage${query}`, {
        headers: options.cookie
            ? {
                  cookie: options.cookie,
              }
            : undefined,
    })
}

describe('GET /api/chat/context-usage', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('仅为当前 session 的会话返回聊天记忆占用和云端有效窗口', async () => {
        const sessionId = `context-usage-${Date.now()}`
        const conversationId = 'conv-context-usage'
        const threadId = buildChatConversationThreadId(sessionId, conversationId, env)

        await conversationRegistryService.createConversation(sessionId, {
            conversationId,
            hasMessages: true,
            now: '2026-09-04T10:00:00.000Z',
        })
        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-context-usage',
            assistantText: '这是需要计入聊天记忆的回答。',
            userMessageId: 'user-context-usage',
            userText: '这是需要计入聊天记忆的问题。',
        })

        const response = await GET(
            createGetRequest({
                conversationId,
                cookie: `ai-mind-session-id=${sessionId}`,
                modelId: 'deepseek/deepseek-v4-flash',
            })
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            effectiveWindowTokens: 128000,
            usedPercent: expect.any(Number),
        })
        expect(body.usedPercent).toBeGreaterThanOrEqual(0)
        expect(JSON.stringify(body)).not.toContain('这是需要计入聊天记忆')
        expect(JSON.stringify(body)).not.toContain('threadId')
    })

    it('按所选 Ollama 模型返回 32K effective window', async () => {
        const sessionId = `context-usage-ollama-${Date.now()}`
        const conversationId = 'conv-context-usage-ollama'

        await conversationRegistryService.createConversation(sessionId, {
            conversationId,
            hasMessages: true,
            now: '2026-09-04T10:00:00.000Z',
        })

        const response = await GET(
            createGetRequest({
                conversationId,
                cookie: `ai-mind-session-id=${sessionId}`,
                modelId: 'ollama/qwen3-8b',
            })
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toMatchObject({ effectiveWindowTokens: 32768, usedPercent: expect.any(Number) })
    })

    it('不为当前 session registry 外的会话返回用量', async () => {
        const response = await GET(
            createGetRequest({
                conversationId: 'conv-not-owned',
                cookie: 'ai-mind-session-id=context-usage-other-session',
                modelId: 'deepseek/deepseek-v4-flash',
            })
        )
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body).toEqual({
            code: 'CONVERSATION_NOT_FOUND',
            error: 'Conversation was not found in the current browser session registry.',
        })
    })
})
