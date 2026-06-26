import { describe, expect, it } from 'vitest'

import { createAgentRunOwnerSessionHash, isAgentRunOwnerSessionHashEqual } from '@/lib/ai/agent-runs'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-32-characters',
}

describe('lib/ai/agent-runs ownership', () => {
    it('使用 HMAC-SHA256 生成稳定且不可逆的 64 位 hex hash', () => {
        const first = createAgentRunOwnerSessionHash('session-a', env)
        const second = createAgentRunOwnerSessionHash('session-a', env)

        expect(first).toBe(second)
        expect(first).toMatch(/^[a-f0-9]{64}$/)
        expect(first).not.toContain('session-a')
    })

    it('sessionId 或 secret 不同会生成不同 hash', () => {
        const first = createAgentRunOwnerSessionHash('session-a', env)
        const second = createAgentRunOwnerSessionHash('session-b', env)
        const third = createAgentRunOwnerSessionHash('session-a', {
            AI_MIND_AGENT_RUN_SESSION_SECRET: 'another-secret-with-at-least-32-chars',
        })

        expect(isAgentRunOwnerSessionHashEqual(first, first)).toBe(true)
        expect(isAgentRunOwnerSessionHashEqual(first, second)).toBe(false)
        expect(isAgentRunOwnerSessionHashEqual(first, third)).toBe(false)
    })

    it('缺少 sessionId 或安全 secret 时 fail closed', () => {
        expect(() => createAgentRunOwnerSessionHash('', env)).toThrow('A non-empty sessionId is required')
        expect(() => createAgentRunOwnerSessionHash('session-a', {})).toThrow(
            'AI_MIND_AGENT_RUN_SESSION_SECRET must contain at least 32 characters.'
        )
        expect(() =>
            createAgentRunOwnerSessionHash('session-a', {
                AI_MIND_AGENT_RUN_SESSION_SECRET: 'too-short',
            })
        ).toThrow('AI_MIND_AGENT_RUN_SESSION_SECRET must contain at least 32 characters.')
    })
})
