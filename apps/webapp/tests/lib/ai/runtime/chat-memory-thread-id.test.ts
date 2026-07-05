import { describe, expect, it } from 'vitest'

import {
    buildChatConversationRegistryThreadId,
    buildChatConversationThreadId,
    buildChatMemoryThreadId,
    isChatConversationRegistryThreadId,
    isChatConversationThreadId,
    isChatMemoryThreadId,
} from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

describe('runtime/chat-memory thread id', () => {
    it('generates a stable legacy single-thread id for the current session path', () => {
        const first = buildChatMemoryThreadId('session-123', env)
        const second = buildChatMemoryThreadId('session-123', env)

        expect(first).toBe(second)
        expect(first).toMatch(/^chat:[a-f0-9]{64}$/)
        expect(isChatMemoryThreadId(first)).toBe(true)
    })

    it('generates a stable conversation-scoped thread id in the new namespace', () => {
        const first = buildChatConversationThreadId('session-123', 'conversation-456', env)
        const second = buildChatConversationThreadId('session-123', 'conversation-456', env)

        expect(first).toBe(second)
        expect(first).toMatch(/^chat-conversation:[a-f0-9]{64}:[a-f0-9]{64}$/)
        expect(isChatConversationThreadId(first)).toBe(true)
        expect(isChatMemoryThreadId(first)).toBe(true)
    })

    it('generates a registry thread id without exposing the raw session id', () => {
        const threadId = buildChatConversationRegistryThreadId('raw-session-value', env)

        expect(threadId).toMatch(/^chat-registry:[a-f0-9]{64}$/)
        expect(threadId).not.toContain('raw-session-value')
        expect(isChatConversationRegistryThreadId(threadId)).toBe(true)
        expect(isChatMemoryThreadId(threadId)).toBe(true)
    })

    it('does not expose raw conversation ids inside the conversation thread id', () => {
        const threadId = buildChatConversationThreadId('raw-session-value', 'conversation-raw-value', env)

        expect(threadId).not.toContain('raw-session-value')
        expect(threadId).not.toContain('conversation-raw-value')
    })

    it('does not mistake Tasklist thread ids for chat memory thread ids', () => {
        expect(isChatMemoryThreadId('tasklist-agent:conversation:run')).toBe(false)
        expect(isChatConversationThreadId('tasklist-agent:conversation:run')).toBe(false)
    })
})
