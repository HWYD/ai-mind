import { describe, expect, it } from 'vitest'

import { getRateLimitConfig } from '@/lib/ai/rate-limit'

describe('getRateLimitConfig', () => {
    it('未配置开关时默认启用限流', () => {
        expect(getRateLimitConfig({})).toMatchObject({
            enabled: true,
            imageDailyLimitPerIp: 10,
            imageDailyLimitPerSession: 3,
        })
    })

    it('只有显式配置 off 时关闭限流', () => {
        expect(getRateLimitConfig({ AI_MIND_RATE_LIMIT_ENABLED: 'off' }).enabled).toBe(false)
        expect(getRateLimitConfig({ AI_MIND_RATE_LIMIT_ENABLED: 'invalid' }).enabled).toBe(true)
    })

    it('读取生图配额并将 IP 上限限制在 10 到 20', () => {
        expect(
            getRateLimitConfig({
                AI_MIND_IMAGE_DAILY_LIMIT_PER_IP: '20',
                AI_MIND_IMAGE_DAILY_LIMIT_PER_SESSION: '5',
            })
        ).toMatchObject({
            imageDailyLimitPerIp: 20,
            imageDailyLimitPerSession: 5,
        })
        expect(getRateLimitConfig({ AI_MIND_IMAGE_DAILY_LIMIT_PER_IP: '9' }).imageDailyLimitPerIp).toBe(10)
        expect(getRateLimitConfig({ AI_MIND_IMAGE_DAILY_LIMIT_PER_IP: '21' }).imageDailyLimitPerIp).toBe(10)
    })
})
