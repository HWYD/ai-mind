import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('GET /api/chat/thread route build safety', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        delete process.env.DATABASE_URL
        delete process.env.AI_MIND_CHAT_MEMORY_CHECKPOINT
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', 'test-secret-with-at-least-thirty-two-characters')
        vi.stubEnv('NODE_ENV', 'production')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('module import does not require DATABASE_URL during next build collection', async () => {
        await expect(import('@/app/api/chat/thread/route')).resolves.toMatchObject({
            GET: expect.any(Function),
            runtime: 'nodejs',
        })
    }, 20000)
})
