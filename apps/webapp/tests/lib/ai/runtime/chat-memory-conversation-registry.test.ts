import { describe, expect, it, vi } from 'vitest'

import {
    buildChatConversationThreadId,
    CHAT_CONVERSATION_REGISTRY_LIMIT,
    ConversationRegistryNotFoundError,
    createChatMemoryService,
    createConversationRegistryService,
    DEFAULT_CHAT_CONVERSATION_TITLE,
} from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

describe('runtime/chat-memory conversation registry', () => {
    it('returns an empty registry state when the registry is empty', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)

        const registry = await service.ensureRegistry('registry-empty-session', {
            now: '2026-07-04T08:00:00.000Z',
        })

        expect(registry).toEqual({
            selectedConversationId: null,
            conversations: [],
            updatedAt: '2026-07-04T08:00:00.000Z',
        })
    })

    it('creates and selects a new persisted conversation without overwriting older conversations', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-create-session'

        await service.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })

        const registry = await service.createConversation(sessionId, {
            conversationId: 'conv-b',
            hasMessages: true,
            now: '2026-07-04T08:01:00.000Z',
        })

        expect(registry.selectedConversationId).toBe('conv-b')
        expect(registry.conversations.map(conversation => conversation.id)).toEqual(['conv-b', 'conv-a'])
    })

    it('updates selection without changing lastActiveAt ordering when selecting an existing conversation', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-select-session'

        await service.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })
        await service.createConversation(sessionId, {
            conversationId: 'conv-b',
            hasMessages: true,
            now: '2026-07-04T08:01:00.000Z',
        })
        await service.createConversation(sessionId, {
            conversationId: 'conv-c',
            hasMessages: true,
            now: '2026-07-04T08:02:00.000Z',
        })

        const registry = await service.selectConversation(sessionId, 'conv-a', {
            now: '2026-07-04T08:03:00.000Z',
        })

        expect(registry.selectedConversationId).toBe('conv-a')
        expect(registry.conversations.map(conversation => conversation.id)).toEqual(['conv-c', 'conv-b', 'conv-a'])
        expect(registry.conversations[2]?.lastActiveAt).toBe('2026-07-04T08:00:00.000Z')
    })

    it('derives the persisted conversation title from the first user message with deterministic truncation', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-title-session'

        const registry = await service.createConversation(sessionId, {
            conversationId: 'conv-title',
            hasMessages: true,
            now: '2026-07-04T08:01:00.000Z',
            userText: '  第一条用户消息\n\n需要被   收敛成安全标题，而且不能继续保留空白会话默认名。 ',
        })

        expect(registry.conversations[0]).toMatchObject({
            hasMessages: true,
            id: 'conv-title',
            lastActiveAt: '2026-07-04T08:01:00.000Z',
            title: '第一条用户消息 需要被 收敛成安全标题，而且不能继续保留空白会话默认名。',
        })
    })

    it('prunes least recently active persisted conversations when the registry exceeds the recent limit', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-prune-session'

        for (let index = 0; index < CHAT_CONVERSATION_REGISTRY_LIMIT + 1; index += 1) {
            await service.createConversation(sessionId, {
                conversationId: `conv-${index}`,
                hasMessages: true,
                now: `2026-07-04T08:${index.toString().padStart(2, '0')}:00.000Z`,
            })
        }

        const registry = await service.ensureRegistry(sessionId)

        expect(registry.conversations).toHaveLength(CHAT_CONVERSATION_REGISTRY_LIMIT)
        expect(registry.conversations.map(conversation => conversation.id)).toEqual([
            'conv-10',
            'conv-9',
            'conv-8',
            'conv-7',
            'conv-6',
            'conv-5',
            'conv-4',
            'conv-3',
            'conv-2',
            'conv-1',
        ])
    })

    it('falls back to the conversation matching registry updatedAt when the stored selectedConversationId is stale', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-stale-selection-session'

        await service.writeRegistry(sessionId, {
            selectedConversationId: 'conv-missing',
            conversations: [
                {
                    id: 'conv-a',
                    title: DEFAULT_CHAT_CONVERSATION_TITLE,
                    createdAt: '2026-07-04T08:02:00.000Z',
                    lastActiveAt: '2026-07-04T08:02:00.000Z',
                    hasMessages: true,
                },
                {
                    id: 'conv-b',
                    title: DEFAULT_CHAT_CONVERSATION_TITLE,
                    createdAt: '2026-07-04T08:03:00.000Z',
                    lastActiveAt: '2026-07-04T08:03:00.000Z',
                    hasMessages: true,
                },
            ],
            updatedAt: '2026-07-04T08:02:00.000Z',
        })

        const registry = await service.ensureRegistry(sessionId)

        expect(registry.selectedConversationId).toBe('conv-a')
        expect(registry.conversations.map(conversation => conversation.id)).toEqual(['conv-b', 'conv-a'])
    })

    it('reassigns selection when the currently selected conversation is pruned out of the registry', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-pruned-selection-session'

        await service.writeRegistry(sessionId, {
            selectedConversationId: 'conv-0',
            conversations: Array.from({ length: CHAT_CONVERSATION_REGISTRY_LIMIT + 1 }, (_, index) => ({
                id: `conv-${index}`,
                title: DEFAULT_CHAT_CONVERSATION_TITLE,
                createdAt: `2026-07-04T08:${index.toString().padStart(2, '0')}:00.000Z`,
                lastActiveAt: `2026-07-04T08:${index.toString().padStart(2, '0')}:00.000Z`,
                hasMessages: true,
            })),
            updatedAt: '2026-07-04T08:10:00.000Z',
        })

        const registry = await service.ensureRegistry(sessionId)

        expect(registry.conversations).toHaveLength(CHAT_CONVERSATION_REGISTRY_LIMIT)
        expect(registry.conversations.map(conversation => conversation.id)).toEqual([
            'conv-10',
            'conv-9',
            'conv-8',
            'conv-7',
            'conv-6',
            'conv-5',
            'conv-4',
            'conv-3',
            'conv-2',
            'conv-1',
        ])
        expect(registry.selectedConversationId).toBe('conv-10')
    })

    it('drops legacy empty conversation entries instead of letting them stay in the persisted registry', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-legacy-empty-session'

        await service.writeRegistry(sessionId, {
            selectedConversationId: 'conv-empty',
            conversations: [
                {
                    id: 'conv-empty',
                    title: DEFAULT_CHAT_CONVERSATION_TITLE,
                    createdAt: '2026-07-04T08:00:00.000Z',
                    lastActiveAt: '2026-07-04T08:00:00.000Z',
                    hasMessages: false,
                },
                {
                    id: 'conv-a',
                    title: 'Conversation A',
                    createdAt: '2026-07-04T08:01:00.000Z',
                    lastActiveAt: '2026-07-04T08:01:00.000Z',
                    hasMessages: true,
                },
                {
                    id: 'conv-b',
                    title: 'Conversation B',
                    createdAt: '2026-07-04T08:02:00.000Z',
                    lastActiveAt: '2026-07-04T08:02:00.000Z',
                    hasMessages: true,
                },
            ],
            updatedAt: '2026-07-04T08:02:00.000Z',
        })

        const registry = await service.ensureRegistry(sessionId)

        expect(registry.conversations.map(conversation => conversation.id)).toEqual(['conv-b', 'conv-a'])
        expect(registry.selectedConversationId).toBe('conv-b')
        await expect(service.getConversation(sessionId, 'conv-empty')).resolves.toBeNull()
    })

    it('throws a safe error when selecting a conversation outside the current session registry', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-invalid-selection-session'

        await service.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })

        await expect(service.selectConversation(sessionId, 'conv-missing')).rejects.toBeInstanceOf(ConversationRegistryNotFoundError)
    })

    it('does not create a persisted registry entry when reading ownership for a session without conversations', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-read-only-ownership-session'

        await expect(service.getConversation(sessionId, 'conv-missing')).resolves.toBeNull()
        await expect(service.readRegistry(sessionId)).resolves.toEqual({
            registry: null,
            restored: false,
        })
        await expect(service.ensureRegistry(sessionId)).resolves.toEqual({
            selectedConversationId: null,
            conversations: [],
            updatedAt: expect.any(String),
        })
    })

    it('deletes the conversation ThreadState before removing the Registry entry and selects a fallback', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const memory = createChatMemoryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-delete-session'

        await service.createConversation(sessionId, {
            conversationId: 'conv-a',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })
        await service.createConversation(sessionId, {
            conversationId: 'conv-b',
            hasMessages: true,
            now: '2026-07-04T08:01:00.000Z',
        })
        await memory.writeThreadState(buildChatConversationThreadId(sessionId, 'conv-b', env), {
            messages: [],
            pinnedDecisions: [],
            summary: 'to be deleted',
        })

        const registry = await service.deleteConversation(sessionId, 'conv-b', {
            now: '2026-07-04T08:02:00.000Z',
        })

        expect(registry.selectedConversationId).toBe('conv-a')
        expect(registry.conversations.map(conversation => conversation.id)).toEqual(['conv-a'])
        await expect(memory.readThreadState(buildChatConversationThreadId(sessionId, 'conv-b', env))).resolves.toMatchObject({
            restored: false,
        })
        await expect(service.getConversation(sessionId, 'conv-b')).resolves.toBeNull()
    })

    it('enters an empty draft after deleting the last conversation', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-delete-last-session'

        await service.createConversation(sessionId, {
            conversationId: 'conv-only',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })

        await expect(service.deleteConversation(sessionId, 'conv-only')).resolves.toMatchObject({
            conversations: [],
            selectedConversationId: null,
        })
    })

    it('keeps the Registry entry when the Registry write fails after ThreadState cleanup', async () => {
        const service = createConversationRegistryService({ checkpointMode: 'memory' }, env)
        const memory = createChatMemoryService({ checkpointMode: 'memory' }, env)
        const sessionId = 'registry-delete-partial-failure-session'
        const threadId = buildChatConversationThreadId(sessionId, 'conv-partial', env)

        await service.createConversation(sessionId, {
            conversationId: 'conv-partial',
            hasMessages: true,
            now: '2026-07-04T08:00:00.000Z',
        })
        await memory.writeThreadState(threadId, {
            messages: [],
            pinnedDecisions: [],
            summary: 'partial failure',
        })
        vi.spyOn(service, 'writeRegistry').mockRejectedValue(new Error('registry write failed'))

        await expect(service.deleteConversation(sessionId, 'conv-partial')).rejects.toThrow('registry write failed')
        await expect(service.getConversation(sessionId, 'conv-partial')).resolves.toMatchObject({ id: 'conv-partial' })
        await expect(memory.readThreadState(threadId)).resolves.toMatchObject({ restored: false })
    })
})
