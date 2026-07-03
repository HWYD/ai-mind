import { describe, expect, it } from 'vitest'

import { buildChatMemoryThreadId, isChatMemoryThreadId } from '@/lib/ai/runtime/chat-memory'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

describe('runtime/chat-memory thread id', () => {
    it('生成 chat:${sessionHash} 格式的稳定 thread id', () => {
        const first = buildChatMemoryThreadId('session-123', env)
        const second = buildChatMemoryThreadId('session-123', env)

        expect(first).toBe(second)
        expect(first).toMatch(/^chat:[a-f0-9]{64}$/)
        expect(isChatMemoryThreadId(first)).toBe(true)
    })

    it('不暴露原始 session id', () => {
        const threadId = buildChatMemoryThreadId('raw-session-value', env)

        expect(threadId).not.toContain('raw-session-value')
    })

    it('不会把 Tasklist thread id 识别为 chat memory thread id', () => {
        expect(isChatMemoryThreadId('tasklist-agent:conversation:run')).toBe(false)
    })
})
