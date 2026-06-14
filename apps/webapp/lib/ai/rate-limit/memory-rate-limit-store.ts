import type { RateLimitConfig } from './rate-limit-config'

interface RateLimitBucket {
    /** ISO date string in YYYY-MM-DD format */
    day: string
    /** 该 IP 在当前天内的请求计数 */
    ipCount: number
    /** 该 session 在当前天内的请求计数 */
    sessionCount: number
}

type BucketKey = `${string}:${string}`

/**
 * 基于内存的轻量限流存储。
 * 仅适用于单实例 Demo 场景，进程重启后计数归零。
 */
export class MemoryRateLimitStore {
    private readonly buckets = new Map<BucketKey, RateLimitBucket>()
    private readonly config: RateLimitConfig

    constructor(config: RateLimitConfig) {
        this.config = config
    }

    /**
     * 在模型调用开始前检查并扣除请求次数。
     * 返回 { allowed: true } 表示可以继续；
     * 返回 { allowed: false, limitKey, limitValue, currentValue } 表示已达上限。
     */
    checkAndIncrement(params: { ip: string; routeType: string; sessionId: string }): {
        allowed: boolean
        limitKey?: 'ip' | 'session'
        currentValue?: number
        limitValue?: number
    } {
        if (!this.config.enabled) {
            return { allowed: true }
        }

        const today = todayKey()

        const ipLimits = this.getLimits(params.routeType)
        const ipKey: BucketKey = `ip:${params.ip}`
        const sessionKey: BucketKey = `session:${params.sessionId}`

        // 检查 IP 维度
        const ipResult = this.checkBucket(ipKey, today, ipLimits.ip, params.ip)
        if (!ipResult.allowed) {
            return { allowed: false, limitKey: 'ip', currentValue: ipResult.current, limitValue: ipLimits.ip }
        }

        // 检查 session 维度
        const sessionResult = this.checkBucket(sessionKey, today, ipLimits.session, params.sessionId)
        if (!sessionResult.allowed) {
            // 回滚 IP 计数（session 超限但 IP 未超，IP 不应被计费）
            this.rollbackBucket(ipKey, today, params.ip)
            return { allowed: false, limitKey: 'session', currentValue: sessionResult.current, limitValue: ipLimits.session }
        }

        return { allowed: true }
    }

    /** 回滚：模型调用前失败不计。只影响计数，不影响已拒绝的后续检查。 */
    rollback(params: { ip: string; sessionId: string }): void {
        const today = todayKey()
        this.rollbackBucket(`ip:${params.ip}`, today, params.ip)
        this.rollbackBucket(`session:${params.sessionId}`, today, params.sessionId)
    }

    private checkBucket(key: BucketKey, today: string, limit: number, _idForDebug: string): { allowed: boolean; current: number } {
        const bucket = this.buckets.get(key)

        if (!bucket || bucket.day !== today) {
            // 新的一天，重置计数
            const newBucket: RateLimitBucket = {
                day: today,
                ipCount: 0,
                sessionCount: 0,
            }
            // 根据 key 前缀决定递增哪个计数器
            if (key.startsWith('ip:')) {
                newBucket.ipCount = 1
            } else {
                newBucket.sessionCount = 1
            }
            this.buckets.set(key, newBucket)
            return { allowed: true, current: 1 }
        }

        const currentCount = key.startsWith('ip:') ? bucket.ipCount + 1 : bucket.sessionCount + 1

        if (currentCount > limit) {
            return { allowed: false, current: limit }
        }

        if (key.startsWith('ip:')) {
            bucket.ipCount = currentCount
        } else {
            bucket.sessionCount = currentCount
        }

        return { allowed: true, current: currentCount }
    }

    private rollbackBucket(key: BucketKey, today: string, _idForDebug: string): void {
        const bucket = this.buckets.get(key)
        if (!bucket || bucket.day !== today) return

        if (key.startsWith('ip:')) {
            bucket.ipCount = Math.max(0, bucket.ipCount - 1)
        } else {
            bucket.sessionCount = Math.max(0, bucket.sessionCount - 1)
        }
    }

    private getLimits(routeType: string): { ip: number; session: number } {
        if (routeType === 'tasklist') {
            return {
                ip: this.config.tasklistDailyLimitPerIp,
                session: this.config.tasklistDailyLimitPerSession,
            }
        }
        return {
            ip: this.config.chatDailyLimitPerIp,
            session: this.config.chatDailyLimitPerSession,
        }
    }
}

function todayKey(): string {
    return new Date().toISOString().slice(0, 10)
}
