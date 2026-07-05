import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/chat/thread/route'
import { buildChatConversationThreadId, chatMemoryService, conversationRegistryService } from '@/lib/ai/runtime/chat-memory'
import * as chatMemoryCompaction from '@/lib/ai/runtime/chat-memory/compaction'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

function createGetRequest(options: { conversationId?: string; cookie?: string } = {}) {
    const query = options.conversationId ? `?conversationId=${encodeURIComponent(options.conversationId)}` : ''

    return new NextRequest(`http://localhost:3000/api/chat/thread${query}`, {
        headers: options.cookie
            ? {
                  cookie: options.cookie,
              }
            : undefined,
    })
}

describe('GET /api/chat/thread', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('缺失 conversationId 时返回 400，不静默 fallback 到 legacy single-thread hydration', async () => {
        const response = await GET(createGetRequest())
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toEqual({
            code: 'INVALID_CONVERSATION_ID',
            error: 'conversationId is required for selected conversation hydration.',
        })
    })

    it('无 persisted conversation 时返回 404，由前端在本地维持 blank draft', async () => {
        const response = await GET(createGetRequest({ conversationId: 'conv-new' }))
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(response.headers.get('Set-Cookie')).toBeNull()
        expect(body).toEqual({
            code: 'CONVERSATION_NOT_FOUND',
            error: 'Conversation was not found in the current browser session registry.',
        })
    })

    it('同一 session 只恢复 selected conversation 的 recent messages', async () => {
        const sessionId = `route-session-${Date.now()}`
        const threadId = buildChatConversationThreadId(sessionId, 'conv-a', env)

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-05T10:00:00.000Z',
        })

        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-route',
            assistantText: '恢复的回答',
            userMessageId: 'user-route',
            userText: '恢复的问题',
        })

        const response = await GET(
            createGetRequest({
                conversationId: 'conv-a',
                cookie: `ai-mind-session-id=${sessionId}`,
            })
        )
        const body = await response.json()

        expect(response.headers.get('Set-Cookie')).toBeNull()
        expect(body).toMatchObject({
            conversationId: 'conv-a',
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
        expect(Object.keys(body).sort()).toEqual(['conversationId', 'messages', 'pinnedDecisions', 'restored', 'threadId'])
        expect(JSON.stringify(body)).not.toContain('graphState')
        expect(JSON.stringify(body)).not.toContain('runtimeArtifact')
    })

    it('conversation 不属于当前 session registry 时返回 404，不泄露其他会话数据', async () => {
        const sessionId = `thread-missing-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-existing',
            hasMessages: true,
            now: '2026-07-05T10:00:00.000Z',
        })

        const response = await GET(
            createGetRequest({
                conversationId: 'conv-missing',
                cookie: `ai-mind-session-id=${sessionId}`,
            })
        )
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body).toEqual({
            code: 'CONVERSATION_NOT_FOUND',
            error: 'Conversation was not found in the current browser session registry.',
        })
    })

    it('storage error 时返回 sanitized empty hydration，不暴露 raw database error', async () => {
        vi.spyOn(chatMemoryService, 'readThreadState').mockRejectedValueOnce(
            new Error('relation "langgraph_chat_memory.checkpoints" does not exist')
        )

        await conversationRegistryService.createConversation('broken-session', {
            conversationId: 'conv-broken',
            hasMessages: true,
            now: '2026-07-05T10:00:00.000Z',
        })

        const response = await GET(
            createGetRequest({
                conversationId: 'conv-broken',
                cookie: 'ai-mind-session-id=broken-session',
            })
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            conversationId: 'conv-broken',
            threadId: expect.stringMatching(/^chat-conversation:[a-f0-9]{64}:[a-f0-9]{64}$/),
            messages: [],
            pinnedDecisions: [],
            restored: false,
        })
        expect(JSON.stringify(body)).not.toContain('langgraph_chat_memory')
    })

    it('hydrates structured final turns as ordinary text messages without metadata leakage', async () => {
        const sessionId = `structured-session-${Date.now()}`
        const threadId = buildChatConversationThreadId(sessionId, 'conv-structured', env)
        const longDeliveryReport = `# Delivery Chain Report\n\n${'A'.repeat(8_400)}`
        const compactThreadStateSpy = vi.spyOn(chatMemoryCompaction, 'compactThreadState').mockImplementation(async state => ({
            lastCompactedAt: '2026-07-04T00:00:00.000Z',
            messages: state.messages.slice(-2),
            pinnedDecisions: ['保留结构化 final turn 的文本记忆'],
            summary: '之前的 tool 与 tasklist final turn 已压缩进摘要。',
        }))

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-structured',
            hasMessages: true,
            now: '2026-07-05T10:00:00.000Z',
        })

        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-tool',
            assistantText: '这是一次 tool final answer。',
            source: 'tool',
            userMessageId: 'user-tool',
            userText: '帮我执行工具',
        })
        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-tasklist',
            assistantText: '已生成任务清单摘要。',
            completionStatus: 'final',
            source: 'tasklist-agent',
            userMessageId: 'user-tasklist',
            userText: '基于版本方案生成 tasklist',
        })
        await chatMemoryService.appendCompletedTurn(threadId, {
            assistantMessageId: 'assistant-delivery',
            assistantText: longDeliveryReport,
            completionStatus: 'blocked',
            source: 'delivery-chain',
            userMessageId: 'user-delivery',
            userText: '生成交付计划',
        })

        const response = await GET(
            createGetRequest({
                conversationId: 'conv-structured',
                cookie: `ai-mind-session-id=${sessionId}`,
            })
        )
        const body = await response.json()
        const serializedBody = JSON.stringify(body)

        expect(response.status).toBe(200)
        expect(body.conversationId).toBe('conv-structured')
        expect(body.threadId).toBe(threadId)
        expect(compactThreadStateSpy).toHaveBeenCalledTimes(1)
        expect(body.messages).toHaveLength(2)
        expect(body.messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant'])
        expect(body.messages[0]?.parts?.[0]?.text).toBe('生成交付计划')
        expect(body.messages[1]?.parts?.[0]?.text.length).toBeLessThanOrEqual(8_000)
        expect(body.pinnedDecisions).toEqual(['保留结构化 final turn 的文本记忆'])
        expect(serializedBody).not.toContain('source')
        expect(serializedBody).not.toContain('turnId')
        expect(serializedBody).not.toContain('displayKind')
        expect(serializedBody).not.toContain('workflowProgress')
        expect(serializedBody).not.toContain('runtimeArtifact')
        expect(serializedBody).not.toContain('graphState')
    })
})
