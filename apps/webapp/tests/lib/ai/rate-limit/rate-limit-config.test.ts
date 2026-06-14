import { describe, expect, it } from 'vitest'

import { getRateLimitConfig } from '@/lib/ai/rate-limit'

describe('getRateLimitConfig', () => {
    it('未配置开关时默认启用限流', () => {
        expect(getRateLimitConfig({}).enabled).toBe(true)
    })

    it('只有显式配置 off 时关闭限流', () => {
        expect(getRateLimitConfig({ AI_MIND_RATE_LIMIT_ENABLED: 'off' }).enabled).toBe(false)
        expect(getRateLimitConfig({ AI_MIND_RATE_LIMIT_ENABLED: 'invalid' }).enabled).toBe(true)
    })
})
