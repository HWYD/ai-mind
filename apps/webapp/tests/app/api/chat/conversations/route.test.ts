import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DELETE, GET, POST } from '@/app/api/chat/conversations/route'
import {
    buildChatConversationThreadId,
    chatMemoryService,
    conversationRegistryService,
    DEFAULT_CHAT_CONVERSATION_TITLE,
} from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

function createGetRequest(options: { conversationId?: string; cookie?: string } = {}) {
    const query = options.conversationId ? `?conversationId=${encodeURIComponent(options.conversationId)}` : ''

    return new NextRequest(`http://localhost:3000/api/chat/conversations${query}`, {
        headers: options.cookie
            ? {
                  cookie: options.cookie,
              }
            : undefined,
    })
}

function createPostRequest(body: unknown, cookie?: string) {
    return new NextRequest('http://localhost:3000/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            ...(cookie ? { cookie } : {}),
            'Content-Type': 'application/json',
        },
    })
}

function createDeleteRequest(body: unknown, cookie?: string) {
    return new NextRequest('http://localhost:3000/api/chat/conversations', {
        method: 'DELETE',
        body: JSON.stringify(body),
        headers: {
            ...(cookie ? { cookie } : {}),
            'Content-Type': 'application/json',
        },
    })
}

describe('GET /api/chat/conversations', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('returns an empty registry when the session has no persisted conversations yet', async () => {
        const response = await GET(createGetRequest())
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('Set-Cookie')).toContain('ai-mind-session-id=')
        expect(body).toEqual({
            limit: 10,
            selectedConversationId: null,
            conversations: [],
        })
        expect(JSON.stringify(body)).not.toContain('thread_id')
        expect(JSON.stringify(body)).not.toContain('checkpoint')
    })

    it('returns the selected conversation registry for the current browser session and applies a valid restore hint without reordering recent items', async () => {
        const sessionId = `conversation-route-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-01-05T10:00:00.000Z',
        })
        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-b',
            hasMessages: true,
            now: '2026-01-05T10:01:00.000Z',
        })

        const response = await GET(
            createGetRequest({
                conversationId: 'conv-a',
                cookie: `ai-mind-session-id=${sessionId}`,
            })
        )
        const body = await response.json()

        expect(response.headers.get('Set-Cookie')).toBeNull()
        expect(body.selectedConversationId).toBe('conv-a')
        expect(body.conversations[0]).toMatchObject({ id: 'conv-b', selected: false })
        expect(body.conversations[1]).toMatchObject({ id: 'conv-a', selected: true })
    })
})

describe('POST /api/chat/conversations', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('rejects the old create-blank-conversation mutation shape', async () => {
        const sessionId = `conversation-create-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-01-05T10:00:00.000Z',
        })

        const response = await POST(createPostRequest({}, `ai-mind-session-id=${sessionId}`))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CONVERSATION_REQUEST')
    })

    it('selects an existing conversation without moving it to the top of the recent list', async () => {
        const sessionId = `conversation-select-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-01-05T10:00:00.000Z',
        })
        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-b',
            hasMessages: true,
            now: '2026-01-05T10:01:00.000Z',
        })

        const response = await POST(
            createPostRequest(
                {
                    conversationId: 'conv-a',
                },
                `ai-mind-session-id=${sessionId}`
            )
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.selectedConversationId).toBe('conv-a')
        expect(body.conversations[0]).toMatchObject({ id: 'conv-b', selected: false })
        expect(body.conversations[1]).toMatchObject({ id: 'conv-a', selected: true })
    })

    it('keeps deterministic default titles when tests seed persisted conversations without user text', async () => {
        const sessionId = `conversation-title-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-title',
            now: '2026-01-05T10:00:00.000Z',
            title: DEFAULT_CHAT_CONVERSATION_TITLE,
        })

        const response = await GET(
            createGetRequest({
                cookie: `ai-mind-session-id=${sessionId}`,
            })
        )
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.conversations[0]).toMatchObject({
            id: 'conv-title',
            title: DEFAULT_CHAT_CONVERSATION_TITLE,
        })
    })
})

describe('DELETE /api/chat/conversations', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', env.AI_MIND_AGENT_RUN_SESSION_SECRET)
    })

    it('rejects an invalid deletion body', async () => {
        const response = await DELETE(createDeleteRequest({}, 'ai-mind-session-id=delete-invalid-session'))
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body.code).toBe('INVALID_CONVERSATION_REQUEST')
    })

    it('deletes the owned conversation and returns the server-selected fallback', async () => {
        const sessionId = `conversation-delete-session-${Date.now()}`

        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-delete-a',
            hasMessages: true,
            now: '2026-01-05T10:00:00.000Z',
        })
        await conversationRegistryService.createConversation(sessionId, {
            conversationId: 'conv-delete-b',
            hasMessages: true,
            now: '2026-01-05T10:01:00.000Z',
        })
        await chatMemoryService.writeThreadState(buildChatConversationThreadId(sessionId, 'conv-delete-b'), {
            messages: [],
            pinnedDecisions: [],
            summary: 'delete me',
        })

        const response = await DELETE(createDeleteRequest({ conversationId: 'conv-delete-b' }, `ai-mind-session-id=${sessionId}`))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.selectedConversationId).toBe('conv-delete-a')
        expect(body.conversations.map((conversation: { id: string }) => conversation.id)).toEqual(['conv-delete-a'])
        await expect(chatMemoryService.readThreadState(buildChatConversationThreadId(sessionId, 'conv-delete-b'))).resolves.toMatchObject({
            restored: false,
        })
    })

    it('returns not found without changing another browser session', async () => {
        const response = await DELETE(
            createDeleteRequest({ conversationId: 'conv-owned-by-other-session' }, 'ai-mind-session-id=delete-owner-session')
        )
        const body = await response.json()

        expect(response.status).toBe(404)
        expect(body.code).toBe('CONVERSATION_NOT_FOUND')
    })

    it('returns a recoverable server error when deletion cannot complete', async () => {
        const deleteSpy = vi.spyOn(conversationRegistryService, 'deleteConversation').mockRejectedValue(new Error('delete unavailable'))

        try {
            const response = await DELETE(
                createDeleteRequest({ conversationId: 'conv-delete-failure' }, 'ai-mind-session-id=delete-failure-session')
            )
            const body = await response.json()

            expect(response.status).toBe(500)
            expect(body.code).toBe('CONVERSATION_REGISTRY_UNAVAILABLE')
        } finally {
            deleteSpy.mockRestore()
        }
    })
})
