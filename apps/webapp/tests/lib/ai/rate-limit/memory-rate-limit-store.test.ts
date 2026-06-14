import { describe, expect, it } from 'vitest'

import { MemoryRateLimitStore } from '@/lib/ai/rate-limit'

describe('MemoryRateLimitStore', () => {
    it('disabled config 会始终放行', () => {
        const store = new MemoryRateLimitStore({
            chatDailyLimitPerIp: 1,
            chatDailyLimitPerSession: 1,
            enabled: false,
            tasklistDailyLimitPerIp: 1,
            tasklistDailyLimitPerSession: 1,
        })

        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-a' })).toEqual({
            allowed: true,
        })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-a' })).toEqual({
            allowed: true,
        })
    })

    it('session 超限时会回滚 IP 计数，避免误扣 quota', () => {
        const store = new MemoryRateLimitStore({
            chatDailyLimitPerIp: 2,
            chatDailyLimitPerSession: 1,
            enabled: true,
            tasklistDailyLimitPerIp: 2,
            tasklistDailyLimitPerSession: 1,
        })

        const first = store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-a' })
        const second = store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-a' })
        const third = store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-b' })

        expect(first).toEqual({ allowed: true })
        expect(second).toEqual({
            allowed: false,
            currentValue: 1,
            limitKey: 'session',
            limitValue: 1,
        })
        expect(third).toEqual({ allowed: true })
    })
})
