import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
    it('返回最小健康检查 JSON', async () => {
        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            service: 'webapp',
            status: 'ok',
        })
    })
})
