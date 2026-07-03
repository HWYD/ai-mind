import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/chat/thread/route'
import { buildChatMemoryThreadId, chatMemoryService } from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

function createGetRequest(cookie?: string) {
    return new NextRequest('http://localhost:3000/api/chat/thread', {
        headers: cookie
            ? {
                  cookie,
              }
            : undefined,
    })
}

describe('GET /api/chat/thread', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('无历史时返回 empty hydration，并为新 session 设置 cookie', async () => {
        const response = await GET(createGetRequest())
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('Set-Cookie')).toContain('ai-mind-session-id=')
        expect(body).toEqual({
            threadId: expect.stringMatching(/^chat:[a-f0-9]{64}$/),
            messages: [],
            pinnedDecisions: [],
            restored: false,
        })
        expect(JSON.stringify(body)).not.toContain('rawCheckpoint')
    })

    it('同一 session 可恢复 recent messages', async () => {
        const sessionId = `route-session-${Date.now()}`
        const threadId = buildChatMemoryThreadId(sessionId, env)

        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-route',
            assistantText: '恢复的回答',
            userMessageId: 'user-route',
            userText: '恢复的问题',
        })

        const response = await GET(createGetRequest(`ai-mind-session-id=${sessionId}`))
        const body = await response.json()

        expect(response.headers.get('Set-Cookie')).toBeNull()
        expect(body).toMatchObject({
            threadId,
            restored: true,
        })
        expect(body.messages).toEqual([
            expect.objectContaining({
                id: 'user-route',
                role: 'user',
                status: 'completed',
            }),
            expect.objectContaining({
                id: 'assistant-route',
                role: 'assistant',
                status: 'completed',
            }),
        ])
        expect(Object.keys(body).sort()).toEqual(['messages', 'pinnedDecisions', 'restored', 'threadId'])
        expect(JSON.stringify(body)).not.toContain('graphState')
        expect(JSON.stringify(body)).not.toContain('runtimeArtifact')
    })

    it('storage error 时返回 sanitized empty hydration，不暴露 raw database error', async () => {
        vi.spyOn(chatMemoryService, 'readThreadState').mockRejectedValueOnce(
            new Error('relation "langgraph_chat_memory.checkpoints" does not exist')
        )

        const response = await GET(createGetRequest('ai-mind-session-id=broken-session'))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            threadId: expect.stringMatching(/^chat:[a-f0-9]{64}$/),
            messages: [],
            pinnedDecisions: [],
            restored: false,
        })
        expect(JSON.stringify(body)).not.toContain('langgraph_chat_memory')
    })
})
