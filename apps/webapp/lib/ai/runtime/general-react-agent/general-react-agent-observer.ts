export type GeneralReActObserverSnapshot = {
    activeRuns: number
    budgetStops: Record<string, number>
    capacityRejections: number
    cleanupFailures: number
    cleanupCount: number
    databaseTransactionMs: TimingMetricSnapshot
    eventLoopDelayMs: TimingMetricSnapshot
    finalizerCalls: number
    logicalToolCalls: number
    loopModelCalls: number
    observationChars: number
    projectionBatchChars: number
    projectionBatchCount: number
    projectionBatchItems: number
    projectionBatchWaitMs: TimingMetricSnapshot
    queueHighWaterBytes: number
    queueHighWaterItems: number
    stopReasons: Record<string, number>
    toolBearingRounds: number
}

const budgetStopReasons = new Set([
    'action_deadline',
    'action_round_limit',
    'model_call_limit',
    'no_progress',
    'observation_limit',
    'run_deadline',
    'tool_call_limit',
])

export class GeneralReActObserver {
    private activeRuns = 0
    private readonly budgetStops: Record<string, number> = {}
    private capacityRejections = 0
    private cleanupFailures = 0
    private cleanupCount = 0
    private readonly databaseTransactionMs = createTimingMetric()
    private readonly eventLoopDelayMs = createTimingMetric()
    private finalizerCalls = 0
    private logicalToolCalls = 0
    private loopModelCalls = 0
    private observationChars = 0
    private projectionBatchChars = 0
    private projectionBatchCount = 0
    private projectionBatchItems = 0
    private readonly projectionBatchWaitMs = createTimingMetric()
    private queueHighWaterBytes = 0
    private queueHighWaterItems = 0
    private readonly stopReasons: Record<string, number> = {}
    private toolBearingRounds = 0

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

    recordRuntimeUsage(input: {
        finalizerCalls: number
        logicalToolCalls: number
        loopModelCalls: number
        observationChars: number
        toolBearingRounds: number
    }): void {
        this.finalizerCalls += normalizeCounter(input.finalizerCalls)
        this.logicalToolCalls += normalizeCounter(input.logicalToolCalls)
        this.loopModelCalls += normalizeCounter(input.loopModelCalls)
        this.observationChars += normalizeCounter(input.observationChars)
        this.toolBearingRounds += normalizeCounter(input.toolBearingRounds)
    }

    recordStopReason(reason: string): void {
        this.stopReasons[reason] = (this.stopReasons[reason] ?? 0) + 1
        if (budgetStopReasons.has(reason)) {
            this.budgetStops[reason] = (this.budgetStops[reason] ?? 0) + 1
        }
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
            budgetStops: { ...this.budgetStops },
            capacityRejections: this.capacityRejections,
            cleanupFailures: this.cleanupFailures,
            cleanupCount: this.cleanupCount,
            databaseTransactionMs: snapshotTimingMetric(this.databaseTransactionMs),
            eventLoopDelayMs: snapshotTimingMetric(this.eventLoopDelayMs),
            finalizerCalls: this.finalizerCalls,
            logicalToolCalls: this.logicalToolCalls,
            loopModelCalls: this.loopModelCalls,
            observationChars: this.observationChars,
            projectionBatchChars: this.projectionBatchChars,
            projectionBatchCount: this.projectionBatchCount,
            projectionBatchItems: this.projectionBatchItems,
            projectionBatchWaitMs: snapshotTimingMetric(this.projectionBatchWaitMs),
            queueHighWaterBytes: this.queueHighWaterBytes,
            queueHighWaterItems: this.queueHighWaterItems,
            stopReasons: { ...this.stopReasons },
            toolBearingRounds: this.toolBearingRounds,
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

function normalizeCounter(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
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
