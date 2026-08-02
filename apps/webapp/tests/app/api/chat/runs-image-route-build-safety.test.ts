import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('GET /api/chat/runs/[runId]/image build safety', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        delete process.env.DATABASE_URL
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_AGENT_RUN_SESSION_SECRET', 'test-secret-with-at-least-thirty-two-characters')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('does not initialize the Prisma data layer during Next build collection', async () => {
        await expect(import('@/app/api/chat/runs/[runId]/image/route')).resolves.toMatchObject({
            GET: expect.any(Function),
            runtime: 'nodejs',
        })
    }, 20000)
})
