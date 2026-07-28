import { describe, expect, it } from 'vitest'

import {
    calculateReconnectDelayMs,
    initialPostRetryPolicy,
    isPermanentStreamRecoveryError,
    isRetryableInitialPostStatus,
    resolveStreamReconnectDecision,
} from '@/components/instamind/chat-stream/stream-reconnect'

describe('stream reconnect policy', () => {
    it('uses 500ms initial delay, 2x exponential backoff, 8s cap and 20% jitter', () => {
        expect(calculateReconnectDelayMs(1, () => 0.5)).toBe(500)
        expect(calculateReconnectDelayMs(2, () => 0.5)).toBe(1000)
        expect(calculateReconnectDelayMs(6, () => 0.5)).toBe(8000)
        expect(calculateReconnectDelayMs(1, () => 0)).toBe(400)
        expect(calculateReconnectDelayMs(1, () => 1)).toBe(600)
    })

    it('stops at max attempts or total retry budget', () => {
        expect(resolveStreamReconnectDecision({ attempt: 8, elapsedMs: 1_000 })).toEqual({
            reason: 'attempts_exhausted',
            retry: false,
        })
        expect(resolveStreamReconnectDecision({ attempt: 1, elapsedMs: 120_000 })).toEqual({
            reason: 'retry_budget_exhausted',
            retry: false,
        })
        expect(
            resolveStreamReconnectDecision({
                attempt: 1,
                elapsedMs: 119_900,
                random: () => 0.5,
            })
        ).toEqual({
            reason: 'retry_budget_exhausted',
            retry: false,
        })
    })

    it('classifies retryable and permanent recovery errors', () => {
        expect(isPermanentStreamRecoveryError('CURSOR_EXPIRED')).toBe(true)
        expect(isPermanentStreamRecoveryError('STREAM_SERVICE_UNAVAILABLE')).toBe(false)
        expect(
            resolveStreamReconnectDecision({
                attempt: 0,
                elapsedMs: 0,
                errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                random: () => 0.5,
            })
        ).toEqual({
            attempt: 1,
            delayMs: 500,
            retry: true,
        })
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0, errorCode: 'CURSOR_AHEAD' })).toEqual({
            reason: 'permanent_error',
            retry: false,
        })
    })

    it('gives explicit cancel priority over the next retry', () => {
        expect(
            resolveStreamReconnectDecision({
                attempt: 0,
                cancelled: true,
                elapsedMs: 0,
                errorCode: 'STREAM_SERVICE_UNAVAILABLE',
            })
        ).toEqual({
            reason: 'cancelled',
            retry: false,
        })
    })

    it('uses a separate bounded policy for an initial POST without a runId', () => {
        expect(initialPostRetryPolicy.maxAttempts).toBe(3)
        expect(initialPostRetryPolicy.totalBudgetMs).toBe(20_000)
        expect(isRetryableInitialPostStatus(408)).toBe(true)
        expect(isRetryableInitialPostStatus(502)).toBe(true)
        expect(isRetryableInitialPostStatus(503)).toBe(true)
        expect(isRetryableInitialPostStatus(504)).toBe(true)
        expect(isRetryableInitialPostStatus(429)).toBe(false)
        expect(isRetryableInitialPostStatus(500)).toBe(false)

        expect(
            resolveStreamReconnectDecision({
                attempt: 2,
                elapsedMs: 1_000,
                policy: initialPostRetryPolicy,
                random: () => 0.5,
            })
        ).toEqual({
            attempt: 3,
            delayMs: 2_000,
            retry: true,
        })
        expect(
            resolveStreamReconnectDecision({
                attempt: 3,
                elapsedMs: 1_000,
                policy: initialPostRetryPolicy,
            })
        ).toEqual({
            reason: 'attempts_exhausted',
            retry: false,
        })
    })
})
