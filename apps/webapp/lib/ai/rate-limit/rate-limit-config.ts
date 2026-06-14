export interface RateLimitConfig {
    enabled: boolean
    /** chat routeType 每日每 IP 上限 */
    chatDailyLimitPerIp: number
    /** chat routeType 每日每 session 上限 */
    chatDailyLimitPerSession: number
    /** tasklist routeType 每日每 IP 上限 */
    tasklistDailyLimitPerIp: number
    /** tasklist routeType 每日每 session 上限 */
    tasklistDailyLimitPerSession: number
}

const defaultRateLimitConfig: RateLimitConfig = {
    enabled: true,
    chatDailyLimitPerIp: 200,
    chatDailyLimitPerSession: 100,
    tasklistDailyLimitPerIp: 50,
    tasklistDailyLimitPerSession: 20,
}

export function getRateLimitConfig(env: Record<string, string | undefined> = process.env): RateLimitConfig {
    // 限流默认开启；只有显式配置 off 才关闭，避免部署时漏配环境变量而失去基础保护。
    const enabled = env.AI_MIND_RATE_LIMIT_ENABLED?.trim() !== 'off'

    if (!enabled) {
        return {
            ...defaultRateLimitConfig,
            enabled: false,
        }
    }

    return {
        enabled,
        chatDailyLimitPerIp: readPositiveInteger(env.AI_MIND_CHAT_DAILY_LIMIT_PER_IP, defaultRateLimitConfig.chatDailyLimitPerIp),
        chatDailyLimitPerSession: readPositiveInteger(
            env.AI_MIND_CHAT_DAILY_LIMIT_PER_SESSION,
            defaultRateLimitConfig.chatDailyLimitPerSession
        ),
        tasklistDailyLimitPerIp: readPositiveInteger(
            env.AI_MIND_TASKLIST_DAILY_LIMIT_PER_IP,
            defaultRateLimitConfig.tasklistDailyLimitPerIp
        ),
        tasklistDailyLimitPerSession: readPositiveInteger(
            env.AI_MIND_TASKLIST_DAILY_LIMIT_PER_SESSION,
            defaultRateLimitConfig.tasklistDailyLimitPerSession
        ),
    }
}

function readPositiveInteger(rawValue: string | undefined, fallback: number): number {
    const value = rawValue?.trim()
    if (!value) return fallback
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
