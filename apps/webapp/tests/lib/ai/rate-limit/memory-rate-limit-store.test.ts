import { describe, expect, it, vi } from 'vitest'

import { MemoryRateLimitStore } from '@/lib/ai/rate-limit'

describe('MemoryRateLimitStore', () => {
    it('disabled config 会始终放行', () => {
        const store = new MemoryRateLimitStore({
            chatDailyLimitPerIp: 1,
            chatDailyLimitPerSession: 1,
            enabled: false,
            tasklistDailyLimitPerIp: 1,
            tasklistDailyLimitPerSession: 1,
            imageDailyLimitPerIp: 10,
            imageDailyLimitPerSession: 3,
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
            imageDailyLimitPerIp: 10,
            imageDailyLimitPerSession: 3,
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

    it('image 使用独立配额桶，普通聊天不会消耗生图次数', () => {
        const store = new MemoryRateLimitStore({
            chatDailyLimitPerIp: 200,
            chatDailyLimitPerSession: 100,
            enabled: true,
            imageDailyLimitPerIp: 10,
            imageDailyLimitPerSession: 3,
            tasklistDailyLimitPerIp: 50,
            tasklistDailyLimitPerSession: 20,
        })

        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'chat', sessionId: 'session-a' })).toEqual({ allowed: true })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({ allowed: true })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({ allowed: true })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({ allowed: true })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({
            allowed: false,
            currentValue: 3,
            limitKey: 'session',
            limitValue: 3,
        })
    })

    it('image IP 配额由多个 Session 共享，并支持回滚活动冲突预占', () => {
        const store = new MemoryRateLimitStore({
            chatDailyLimitPerIp: 200,
            chatDailyLimitPerSession: 100,
            enabled: true,
            imageDailyLimitPerIp: 10,
            imageDailyLimitPerSession: 3,
            tasklistDailyLimitPerIp: 50,
            tasklistDailyLimitPerSession: 20,
        })

        for (let index = 0; index < 10; index += 1) {
            expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: `session-${index}` })).toEqual({
                allowed: true,
            })
        }
        store.rollback({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-9' })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-10' })).toEqual({ allowed: true })
        expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-11' })).toEqual({
            allowed: false,
            currentValue: 10,
            limitKey: 'ip',
            limitValue: 10,
        })
    })

    it('image 配额在服务端自然日切换后恢复', () => {
        vi.useFakeTimers()
        try {
            const store = new MemoryRateLimitStore({
                chatDailyLimitPerIp: 200,
                chatDailyLimitPerSession: 100,
                enabled: true,
                imageDailyLimitPerIp: 10,
                imageDailyLimitPerSession: 3,
                tasklistDailyLimitPerIp: 50,
                tasklistDailyLimitPerSession: 20,
            })

            vi.setSystemTime(new Date('2026-08-02T23:59:00.000Z'))
            expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({ allowed: true })
            vi.setSystemTime(new Date('2026-08-03T00:00:00.000Z'))
            expect(store.checkAndIncrement({ ip: '127.0.0.1', routeType: 'image', sessionId: 'session-a' })).toEqual({ allowed: true })
        } finally {
            vi.useRealTimers()
        }
    })
})
