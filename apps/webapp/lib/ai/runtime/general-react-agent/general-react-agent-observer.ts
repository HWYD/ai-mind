export type GeneralReActObserverSnapshot = {
    activeRuns: number
    capacityRejections: number
    cleanupFailures: number
    cleanupCount: number
    databaseTransactionMs: TimingMetricSnapshot
    eventLoopDelayMs: TimingMetricSnapshot
    projectionBatchChars: number
    projectionBatchCount: number
    projectionBatchItems: number
    projectionBatchWaitMs: TimingMetricSnapshot
    queueHighWaterBytes: number
    queueHighWaterItems: number
    stopReasons: Record<string, number>
}

export class GeneralReActObserver {
    private activeRuns = 0
    private capacityRejections = 0
    private cleanupFailures = 0
    private cleanupCount = 0
    private readonly databaseTransactionMs = createTimingMetric()
    private readonly eventLoopDelayMs = createTimingMetric()
    private projectionBatchChars = 0
    private projectionBatchCount = 0
    private projectionBatchItems = 0
    private readonly projectionBatchWaitMs = createTimingMetric()
    private queueHighWaterBytes = 0
    private queueHighWaterItems = 0
    private readonly stopReasons: Record<string, number> = {}

    recordRunStarted(): void {
        this.activeRuns += 1
    }

    recordRunReleased(): void {
        this.activeRuns = Math.max(0, this.activeRuns - 1)
    }

    recordCapacityRejection(): void {
        this.capacityRejections += 1
    }

    recordProjectionBatch(input: { chars: number; items: number; waitMs: number }): void {
        this.projectionBatchCount += 1
        this.projectionBatchChars += Math.max(0, input.chars)
        this.projectionBatchItems += Math.max(0, input.items)
        addTimingMetric(this.projectionBatchWaitMs, input.waitMs)
    }

    recordQueueHighWater(input: { bytes: number; items: number }): void {
        this.queueHighWaterBytes = Math.max(this.queueHighWaterBytes, input.bytes)
        this.queueHighWaterItems = Math.max(this.queueHighWaterItems, input.items)
    }

    recordDatabaseTransaction(durationMs: number): void {
        addTimingMetric(this.databaseTransactionMs, durationMs)
    }

    recordEventLoopDelay(durationMs: number): void {
        addTimingMetric(this.eventLoopDelayMs, durationMs)
    }

    recordStopReason(reason: string): void {
        this.stopReasons[reason] = (this.stopReasons[reason] ?? 0) + 1
    }

    recordCleanup(input: { failed: boolean }): void {
        this.cleanupCount += 1
        if (input.failed) {
            this.cleanupFailures += 1
        }
    }

    snapshot(): GeneralReActObserverSnapshot {
        return {
            activeRuns: this.activeRuns,
            capacityRejections: this.capacityRejections,
            cleanupFailures: this.cleanupFailures,
            cleanupCount: this.cleanupCount,
            databaseTransactionMs: snapshotTimingMetric(this.databaseTransactionMs),
            eventLoopDelayMs: snapshotTimingMetric(this.eventLoopDelayMs),
            projectionBatchChars: this.projectionBatchChars,
            projectionBatchCount: this.projectionBatchCount,
            projectionBatchItems: this.projectionBatchItems,
            projectionBatchWaitMs: snapshotTimingMetric(this.projectionBatchWaitMs),
            queueHighWaterBytes: this.queueHighWaterBytes,
            queueHighWaterItems: this.queueHighWaterItems,
            stopReasons: { ...this.stopReasons },
        }
    }
}

export const generalReActObserver = new GeneralReActObserver()

const timingSampleWindowSize = 1_024

type TimingMetric = { count: number; nextSampleIndex: number; samples: number[]; total: number }

// count / total 是进程内累计值；max / p50 / p95 只基于最近 timingSampleWindowSize(1024) 个样本的滚动窗口计算。
type TimingMetricSnapshot = { count: number; max: number; p50: number; p95: number; total: number }

function createTimingMetric(): TimingMetric {
    return { count: 0, nextSampleIndex: 0, samples: [], total: 0 }
}

function addTimingMetric(metric: TimingMetric, durationMs: number): void {
    const normalized = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
    metric.count += 1
    if (metric.samples.length < timingSampleWindowSize) {
        metric.samples.push(normalized)
    } else {
        metric.samples[metric.nextSampleIndex] = normalized
    }
    metric.nextSampleIndex = (metric.nextSampleIndex + 1) % timingSampleWindowSize
    metric.total += normalized
}

function snapshotTimingMetric(metric: TimingMetric): TimingMetricSnapshot {
    const ordered = [...metric.samples].sort((first, second) => first - second)

    return {
        count: metric.count,
        max: ordered.at(-1) ?? 0,
        p50: percentile(ordered, 0.5),
        p95: percentile(ordered, 0.95),
        total: metric.total,
    }
}

function percentile(ordered: number[], ratio: number): number {
    if (ordered.length === 0) {
        return 0
    }

    return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)]!
}
