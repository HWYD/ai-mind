import { describe, expect, it } from 'vitest'

import { GeneralReActObserver } from '@/lib/ai/runtime/general-react-agent/general-react-agent-observer'

describe('general-react-agent observer', () => {
    it('records content-free capacity, projection and cleanup metrics', () => {
        const observer = new GeneralReActObserver()

        observer.recordRunStarted()
        observer.recordCapacityRejection()
        observer.recordProjectionBatch({ chars: 320, items: 2, waitMs: 7 })
        observer.recordQueueHighWater({ bytes: 260_000, items: 65 })
        observer.recordDatabaseTransaction(12)
        observer.recordDatabaseTransaction(8)
        observer.recordDatabaseTransaction(20)
        observer.recordEventLoopDelay(4)
        observer.recordStopReason('action_deadline')
        observer.recordCleanup({ failed: false })
        observer.recordRunReleased()

        expect(observer.snapshot()).toEqual({
            activeRuns: 0,
            capacityRejections: 1,
            cleanupFailures: 0,
            cleanupCount: 1,
            databaseTransactionMs: { count: 3, max: 20, p50: 12, p95: 20, total: 40 },
            eventLoopDelayMs: { count: 1, max: 4, p50: 4, p95: 4, total: 4 },
            projectionBatchChars: 320,
            projectionBatchCount: 1,
            projectionBatchItems: 2,
            projectionBatchWaitMs: { count: 1, max: 7, p50: 7, p95: 7, total: 7 },
            queueHighWaterBytes: 260_000,
            queueHighWaterItems: 65,
            stopReasons: { action_deadline: 1 },
        })
    })

    it('uses a fixed rolling window for timing percentiles instead of retaining every process-lifetime sample', () => {
        const observer = new GeneralReActObserver()

        observer.recordDatabaseTransaction(9_999)
        for (let index = 0; index < 1_024; index += 1) {
            observer.recordDatabaseTransaction(1)
        }

        expect(observer.snapshot().databaseTransactionMs).toEqual({
            count: 1_025,
            max: 1,
            p50: 1,
            p95: 1,
            total: 11_023,
        })
    })
})
