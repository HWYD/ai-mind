import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as GETConversations } from '@/app/api/chat/conversations/route'
import { GET as GETThread } from '@/app/api/chat/thread/route'
import { buildChatConversationThreadId, chatMemoryService, conversationRegistryService } from '@/lib/ai/runtime/chat-memory'
import { resetUserMemoryStoreForTests, userMemoryService } from '@/lib/ai/runtime/user-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

function createThreadRequest(conversationId: string, cookie: string) {
    return new NextRequest(`http://localhost:3000/api/chat/thread?conversationId=${encodeURIComponent(conversationId)}`, {
        headers: { cookie },
    })
}

function createConversationsRequest(cookie: string) {
    return new NextRequest('http://localhost:3000/api/chat/conversations', {
        headers: { cookie },
    })
}

describe('route user-memory non-regression', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
        resetUserMemoryStoreForTests()
    })

    it('hydration route 不暴露 UserMemory payload', async () => {
        const sessionId = `hydration-session-${Date.now()}`
        const conversationId = 'conv-a'
        const threadId = buildChatConversationThreadId(sessionId, conversationId, env)

        await conversationRegistryService.createConversation(sessionId, {
            conversationId,
            hasMessages: true,
            now: '2026-07-06T10:00:00.000Z',
        })
        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantText: '这是当前 conversation 的回答。',
            userText: '这是当前 conversation 的问题。',
        })
        await userMemoryService.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: conversationId,
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId,
        })

        const response = await GETThread(createThreadRequest(conversationId, `ai-mind-session-id=${sessionId}`))
        const body = await response.json()
        const serialized = JSON.stringify(body)

        expect(response.status).toBe(200)
        expect(Object.keys(body).sort()).toEqual(['conversationId', 'messages', 'pinnedDecisions', 'restored', 'threadId'])
        expect(serialized).not.toContain('userMemory')
        expect(serialized).not.toContain('selectedUserMemories')
        expect(serialized).not.toContain('stableKey')
        expect(serialized).not.toContain('用户喜欢吃桃子')
    })

    it('conversation registry route 不暴露 UserMemory payload', async () => {
        const sessionId = `conversation-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-06T10:00:00.000Z',
        })
        await userMemoryService.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conv-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId,
        })

        const response = await GETConversations(createConversationsRequest(`ai-mind-session-id=${sessionId}`))
        const body = await response.json()
        const serialized = JSON.stringify(body)

        expect(response.status).toBe(200)
        expect(Object.keys(body).sort()).toEqual(['conversations', 'limit', 'selectedConversationId'])
        expect(serialized).not.toContain('userMemory')
        expect(serialized).not.toContain('selectedUserMemories')
        expect(serialized).not.toContain('stableKey')
        expect(serialized).not.toContain('用户喜欢吃桃子')
    })
})
