import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

import { getPrismaClient, prismaPoolConfig } from '@ai-mind/database'
import { afterEach, describe, expect, it } from 'vitest'

import { GeneralReActExecutionGate } from '@/lib/ai/runtime/general-react-agent/execution-gate'
import { GeneralReActObserver } from '@/lib/ai/runtime/general-react-agent/general-react-agent-observer'
import { DurableStreamProjectionBuffer } from '@/lib/ai/stream-recovery/durable-stream-projection-buffer'
import { StreamEventStore } from '@/lib/ai/stream-recovery/stream-event-store'

import { createReferenceLoadConfig } from './reference-load-config'

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim())
const describeWithDatabase = hasDatabase ? describe : describe.skip
const prisma = hasDatabase ? getPrismaClient() : undefined
const createdRunIds: string[] = []
const referenceLoadConfig = createReferenceLoadConfig(process.env)
const referenceLoadConcurrency = 8

function createOwnerSessionHash() {
    return crypto.randomUUID().replaceAll('-', '').padEnd(64, 'a').slice(0, 64)
}

describeWithDatabase('general-react-agent eight-run PostgreSQL reference load', () => {
    afterEach(async () => {
        const runIds = createdRunIds.splice(0)
        if (runIds.length === 0) return

        await prisma!.streamRun.deleteMany({
            where: { id: { in: runIds } },
        })
    })

    it('completes eight deterministic runs, rejects the ninth before provider/tool work, and records bounded metrics', async () => {
        const observer = new GeneralReActObserver()
        const gate = new GeneralReActExecutionGate(observer)
        const store = new StreamEventStore()
        const eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 })
        await warmReferenceLoadConnections(referenceLoadConcurrency)
        const runRecords = await Promise.all(
            Array.from({ length: referenceLoadConcurrency }, () =>
                prisma!.streamRun.create({
                    data: {
                        kind: 'chat',
                        maxEventPayloadBytes: 262_144,
                        maxRetainedEvents: 20_000,
                        ownerSessionHash: createOwnerSessionHash(),
                        retentionUntil: new Date(Date.now() + 10 * 60 * 1000),
                        status: 'running',
                    },
                })
            )
        )
        createdRunIds.push(...runRecords.map(run => run.id))

        let releaseStartBarrier!: () => void
        const startBarrier = new Promise<void>(resolve => {
            releaseStartBarrier = resolve
        })

        eventLoopHistogram.enable()
        const runPromises = runRecords.map(run => runScriptedReferenceRun({ gate, observer, run, startBarrier, store }))

        expect(gate.activeCount()).toBe(referenceLoadConcurrency)
        const ninthRun = await runScriptedReferenceRun({ gate, observer, startBarrier, store })
        expect(ninthRun).toEqual({ admitted: false, committedAt: [], providerCalls: 0, toolCalls: 0 })
        releaseStartBarrier()
        const completedRuns = await Promise.all(runPromises)
        eventLoopHistogram.disable()

        const providerCalls = completedRuns.reduce((total, run) => total + run.providerCalls, 0)
        const toolCalls = completedRuns.reduce((total, run) => total + run.toolCalls, 0)
        const committedAtByRun = completedRuns.flatMap(run => (run.admitted ? [run.committedAt] : []))

        const eventCount = await prisma!.streamEvent.count({
            where: { runId: { in: runRecords.map(run => run.id) } },
        })
        const snapshot = observer.snapshot()
        const eventLoopDelay = {
            max: eventLoopHistogram.max / 1e6,
            p50: eventLoopHistogram.percentile(50) / 1e6,
            p95: eventLoopHistogram.percentile(95) / 1e6,
        }
        const commitCadence = committedAtByRun.flatMap(committedAt =>
            committedAt.slice(1).map((value, index) => value - committedAt[index]!)
        )
        const browserCommitCadence = {
            max: Math.max(0, ...commitCadence),
            p50: percentile(commitCadence, 0.5),
            p95: percentile(commitCadence, 0.95),
        }

        // 参考负载指标需要进入 integration 输出，便于 acceptance 记录，不输出任何内容数据。
        // eslint-disable-next-line no-console
        console.info(
            '[general-react-agent-reference-load]',
            JSON.stringify({
                browserCommitCadence,
                cleanupCount: snapshot.cleanupCount,
                cleanupFailures: snapshot.cleanupFailures,
                databaseTransactionMs: snapshot.databaseTransactionMs,
                eventCount,
                eventLoopDelay,
                measurementPhase: 'post-warm',
                measurementConditions: {
                    concurrency: referenceLoadConcurrency,
                    databaseInstance: referenceLoadConfig.databaseInstance,
                    pool: prismaPoolConfig,
                    topology: referenceLoadConfig.topology,
                    warmupCompleted: true,
                    warmupConnectionCount: referenceLoadConcurrency,
                },
                performanceGate: referenceLoadConfig.performanceGate,
                providerCalls,
                queueHighWaterBytes: snapshot.queueHighWaterBytes,
                queueHighWaterItems: snapshot.queueHighWaterItems,
                toolCalls,
                transactionSampleCount: snapshot.databaseTransactionMs.count,
            })
        )

        expect(providerCalls).toBe(referenceLoadConcurrency)
        expect(toolCalls).toBe(referenceLoadConcurrency)
        expect(eventCount).toBe(24)
        expect(snapshot.activeRuns).toBe(0)
        expect(snapshot.capacityRejections).toBe(1)
        expect(snapshot.cleanupCount).toBe(8)
        expect(snapshot.cleanupFailures).toBe(0)
        expect(snapshot.projectionBatchCount).toBe(24)
        expect(snapshot.databaseTransactionMs.count).toBe(referenceLoadConcurrency * 3)
        expect(snapshot.queueHighWaterItems).toBeLessThanOrEqual(64)
        expect(snapshot.queueHighWaterBytes).toBeLessThanOrEqual(262_144)
        expect(snapshot.databaseTransactionMs.p95).toBeGreaterThanOrEqual(0)
        if (referenceLoadConfig.performanceGate === 'production-like') {
            expect(snapshot.databaseTransactionMs.p95).toBeLessThanOrEqual(20)
        }
        expect(eventLoopDelay.p95).toBeGreaterThanOrEqual(0)
        expect(browserCommitCadence.p95).toBeGreaterThanOrEqual(0)
    })
})

async function warmReferenceLoadConnections(connectionCount: number) {
    await Promise.all(Array.from({ length: connectionCount }, () => prisma!.$queryRaw`SELECT 1`))
}

type ReferenceLoadRunRecord = { id: string; ownerSessionHash: string }

type ScriptedReferenceRunResult = {
    admitted: boolean
    committedAt: number[]
    providerCalls: number
    toolCalls: number
}

async function runScriptedReferenceRun(input: {
    gate: GeneralReActExecutionGate
    observer: GeneralReActObserver
    run?: ReferenceLoadRunRecord
    startBarrier: Promise<void>
    store: StreamEventStore
}): Promise<ScriptedReferenceRunResult> {
    const permit = input.gate.tryAcquire()
    if (!permit) {
        return { admitted: false, committedAt: [], providerCalls: 0, toolCalls: 0 }
    }

    if (!input.run) {
        permit.release()
        throw new Error('An admitted scripted reference run requires a durable run record.')
    }

    const committedAt: number[] = []
    const buffer = new DurableStreamProjectionBuffer({
        appendEvents: (inputs, options) => input.store.appendEvents(inputs, options),
        observer: input.observer,
        publishCommitted: () => {
            committedAt.push(performance.now())
        },
    })

    try {
        await input.startBarrier
        await buffer.publish({
            eventKind: 'chunk',
            ownerSessionHash: input.run.ownerSessionHash,
            payload: { partId: 'answer', type: 'text-start' },
            runId: input.run.id,
        })
        await buffer.publish({
            eventKind: 'chunk',
            ownerSessionHash: input.run.ownerSessionHash,
            payload: { delta: `deterministic-${input.run.id.slice(0, 8)}`, partId: 'answer', type: 'text-delta' },
            runId: input.run.id,
        })
        await buffer.publish({
            eventKind: 'terminal',
            ownerSessionHash: input.run.ownerSessionHash,
            payload: { type: 'finish' },
            runId: input.run.id,
            terminalState: 'completed',
        })
        await buffer.drain()
        return { admitted: true, committedAt, providerCalls: 1, toolCalls: 1 }
    } finally {
        permit.release()
        input.observer.recordCleanup({ failed: false })
    }
}

function percentile(values: number[], ratio: number) {
    if (values.length === 0) return 0
    const ordered = [...values].sort((left, right) => left - right)
    return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)] ?? 0
}
