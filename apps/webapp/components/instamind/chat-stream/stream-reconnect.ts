import { type StreamApiErrorCode, streamRetryPolicy } from '@/lib/ai/stream-recovery/contracts'

export interface StreamRetryPolicy {
    initialDelayMs: number
    jitterRatio: number
    maxAttempts: number
    maxDelayMs: number
    multiplier: number
    totalBudgetMs: number
}

export const initialPostRetryPolicy = {
    ...streamRetryPolicy,
    maxAttempts: 3,
    totalBudgetMs: 20_000,
} as const satisfies StreamRetryPolicy

export type StreamReconnectDecision =
    | {
          retry: true
          delayMs: number
          attempt: number
      }
    | {
          retry: false
          reason: 'attempts_exhausted' | 'cancelled' | 'permanent_error' | 'retry_budget_exhausted'
      }

export interface ResolveStreamReconnectDecisionInput {
    attempt: number
    elapsedMs: number
    errorCode?: StreamApiErrorCode
    cancelled?: boolean
    policy?: StreamRetryPolicy
    random?: () => number
}

const permanentErrorCodes: ReadonlySet<StreamApiErrorCode> = new Set([
    'CURSOR_AHEAD', // 游标超前 → 数据对不上
    'CURSOR_EXPIRED', // 游标过期 → 数据已清理
    'IDEMPOTENCY_CONFLICT', // 游标过期 → 数据已清理
    'INVALID_CURSOR', // 游标格式坏了
    'STREAM_RUN_FORBIDDEN', // 没权限
    'STREAM_RUN_NOT_FOUND', // 流不存在
    'VERSION_MISMATCH', // 流不存在
])

export function isPermanentStreamRecoveryError(errorCode: StreamApiErrorCode | undefined): boolean {
    return Boolean(errorCode && permanentErrorCodes.has(errorCode))
}

export function isRetryableInitialPostStatus(status: number): boolean {
    return status === 408 || status === 502 || status === 503 || status === 504
}
//延迟计算：指数退避 + 随机抖动
export function calculateReconnectDelayMs(
    attempt: number,
    random: () => number = Math.random,
    policy: StreamRetryPolicy = streamRetryPolicy
): number {
    const safeAttempt = Math.max(1, attempt)
    const exponentialDelay = policy.initialDelayMs * policy.multiplier ** (safeAttempt - 1)
    const cappedDelay = Math.min(exponentialDelay, policy.maxDelayMs)
    const jitterRange = cappedDelay * policy.jitterRatio
    const jitter = (random() * 2 - 1) * jitterRange

    return Math.max(0, Math.round(cappedDelay + jitter))
}

export function resolveStreamReconnectDecision(input: ResolveStreamReconnectDecisionInput): StreamReconnectDecision {
    const policy = input.policy ?? streamRetryPolicy

    if (input.cancelled) {
        return {
            reason: 'cancelled',
            retry: false,
        }
    }

    if (isPermanentStreamRecoveryError(input.errorCode)) {
        return {
            reason: 'permanent_error',
            retry: false,
        }
    }

    if (input.attempt >= policy.maxAttempts) {
        return {
            reason: 'attempts_exhausted',
            retry: false,
        }
    }

    if (input.elapsedMs >= policy.totalBudgetMs) {
        return {
            reason: 'retry_budget_exhausted',
            retry: false,
        }
    }

    const nextAttempt = input.attempt + 1
    const delayMs = calculateReconnectDelayMs(nextAttempt, input.random, policy)

    if (input.elapsedMs + delayMs > policy.totalBudgetMs) {
        return {
            reason: 'retry_budget_exhausted',
            retry: false,
        }
    }

    return {
        attempt: nextAttempt,
        delayMs,
        retry: true,
    }
}
