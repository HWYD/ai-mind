import type { GeneralReActObserver } from '@/lib/ai/runtime/general-react-agent/general-react-agent-observer'
import type { StreamEventEnvelopeDto } from '@/lib/ai/stream-recovery/contracts'
import type { AppendStreamEventInput, AppendStreamEventsOptions } from '@/lib/ai/stream-recovery/stream-event-store'

export type DurableStreamProjectionBufferErrorCode =
    | 'PROJECTION_ABORTED'
    | 'PROJECTION_CLOSED'
    | 'PROJECTION_FAILED'
    | 'PROJECTION_ITEM_TOO_LARGE'

export class DurableStreamProjectionBufferError extends Error {
    readonly code: DurableStreamProjectionBufferErrorCode
    readonly cause?: unknown

    constructor(code: DurableStreamProjectionBufferErrorCode, message: string, options: { cause?: unknown } = {}) {
        super(message)
        this.name = 'DurableStreamProjectionBufferError'
        this.code = code
        this.cause = options.cause
    }
}

export type DurableStreamProjectionBufferOptions = {
    appendEvents: (inputs: readonly AppendStreamEventInput[], options?: AppendStreamEventsOptions) => Promise<StreamEventEnvelopeDto[]>
    publishCommitted: (event: StreamEventEnvelopeDto) => void | Promise<void>
    deadlineAtMs?: number
    observer?: GeneralReActObserver
    signal?: AbortSignal
}

type PendingProjection = {
    input: AppendStreamEventInput
    payloadBytes: number
}

type CapacityWaiter = {
    reject: (reason: DurableStreamProjectionBufferError) => void
    resolve: () => void
}

const flushIntervalMs = 40
const flushChars = 256
const highWaterItems = 64
const highWaterBytes = 256 * 1024
const lowWaterItems = 32
const lowWaterBytes = 128 * 1024

export class DurableStreamProjectionBuffer {
    private readonly appendEvents: DurableStreamProjectionBufferOptions['appendEvents']
    private readonly publishCommitted: DurableStreamProjectionBufferOptions['publishCommitted']
    private readonly deadlineAtMs: number | undefined
    private readonly observer: GeneralReActObserver | undefined
    private readonly signal: AbortSignal | undefined
    private readonly seenTextParts = new Set<string>()
    private readonly capacityWaiters = new Set<CapacityWaiter>()
    private pending: PendingProjection[] = []
    private pendingItems = 0
    private pendingBytes = 0
    private flushRequested = false
    private flushPromise: Promise<void> | undefined
    private flushTimer: ReturnType<typeof setTimeout> | undefined
    private failure: DurableStreamProjectionBufferError | undefined
    private terminalQueued = false
    private drained = false

    constructor(options: DurableStreamProjectionBufferOptions) {
        this.appendEvents = options.appendEvents
        this.publishCommitted = options.publishCommitted
        this.deadlineAtMs = options.deadlineAtMs
        this.observer = options.observer
        this.signal = options.signal

        if (this.signal?.aborted) {
            this.abort()
        } else {
            this.signal?.addEventListener('abort', this.abort, { once: true })
        }
    }

    async publish(input: AppendStreamEventInput): Promise<void> {
        this.assertAccepting()
        const isTerminal = input.terminalState !== undefined
        if (isTerminal) {
            // terminal 的接纳权必须在第一次 await 前保留，避免同一 tick 的并发 publish 越过封口。
            this.terminalQueued = true
        }

        let projection: PendingProjection
        try {
            projection = await this.admit(input, isTerminal)
        } catch (error) {
            if (isTerminal && !this.failure) {
                this.terminalQueued = false
            }
            throw error
        }
        const isTextDelta = isPublicTextDelta(projection.input)
        const textKey = isTextDelta ? getTextPartKey(projection.input) : undefined
        const isFirstTextDelta = Boolean(textKey && !this.seenTextParts.has(textKey))
        const deltaChars = getTextDeltaChars(projection.input)

        if (textKey) {
            this.seenTextParts.add(textKey)
        }
        const mustFlush = !isTextDelta || isFirstTextDelta || deltaChars >= flushChars || this.isAtHighWater()

        if (mustFlush) {
            const flush = this.requestFlush()
            if (!isTextDelta || isFirstTextDelta || deltaChars >= flushChars) {
                await flush
                return
            }
        } else {
            this.ensureFlushTimer()
        }

        if (this.isAtHighWater()) {
            await this.waitUntilLowWater()
        }
    }

    async flush(): Promise<void> {
        this.assertOperational()
        await this.requestFlush()
    }

    async drain(): Promise<void> {
        this.assertOperational()
        await this.requestFlush()
        this.assertOperational()
        this.drained = true
        this.clearFlushTimer()
        this.signal?.removeEventListener('abort', this.abort)
    }

    private async admit(input: AppendStreamEventInput, terminalReservation: boolean): Promise<PendingProjection> {
        while (true) {
            this.assertOperational()
            if (this.terminalQueued && !terminalReservation) {
                throw new DurableStreamProjectionBufferError('PROJECTION_CLOSED', 'Cannot publish after a terminal projection event.')
            }
            const mergeTarget = this.getMergeTarget(input)
            const nextInput = mergeTarget ? mergeTextDelta(mergeTarget.input, input) : input
            const nextBytes = calculatePayloadBytes(nextInput)
            const itemDelta = mergeTarget ? 0 : 1
            const byteDelta = mergeTarget ? nextBytes - mergeTarget.payloadBytes : nextBytes

            if (nextBytes > highWaterBytes) {
                throw new DurableStreamProjectionBufferError(
                    'PROJECTION_ITEM_TOO_LARGE',
                    'A single public projection item exceeds the pending byte boundary.'
                )
            }

            if (this.canAdmit(itemDelta, byteDelta)) {
                if (mergeTarget) {
                    mergeTarget.input = nextInput
                    mergeTarget.payloadBytes = nextBytes
                } else {
                    this.pending.push({ input: nextInput, payloadBytes: nextBytes })
                }
                this.pendingItems += itemDelta
                this.pendingBytes += byteDelta
                this.observer?.recordQueueHighWater({ bytes: this.pendingBytes, items: this.pendingItems })
                return mergeTarget ?? this.pending.at(-1)!
            }

            this.requestFlushWithoutUnhandledRejection()
            await this.waitUntilLowWater()
        }
    }

    private canAdmit(itemDelta: number, byteDelta: number): boolean {
        return this.pendingItems + itemDelta <= highWaterItems && this.pendingBytes + byteDelta <= highWaterBytes
    }

    private getMergeTarget(input: AppendStreamEventInput): PendingProjection | undefined {
        if (!isPublicTextDelta(input)) {
            return undefined
        }

        const tail = this.pending.at(-1)
        if (!tail || !isPublicTextDelta(tail.input)) {
            return undefined
        }

        return getTextPartKey(tail.input) === getTextPartKey(input) ? tail : undefined
    }

    private requestFlush(): Promise<void> {
        this.flushRequested = true
        this.clearFlushTimer()

        if (!this.flushPromise) {
            const currentFlush = this.runFlushLoop()
            this.flushPromise = currentFlush
            void currentFlush
                .finally(() => {
                    if (this.flushPromise === currentFlush) {
                        this.flushPromise = undefined
                    }
                })
                .catch(() => undefined)
        }

        return this.flushPromise
    }

    private requestFlushWithoutUnhandledRejection(): void {
        void this.requestFlush().catch(() => undefined)
    }

    private async runFlushLoop(): Promise<void> {
        try {
            while (this.flushRequested) {
                this.flushRequested = false
                this.assertOperational()

                if (this.pending.length === 0) {
                    continue
                }

                const batch = this.pending
                this.pending = []
                const startedAt = Date.now()
                const committed = await this.appendEvents(
                    batch.map(item => item.input),
                    this.deadlineAtMs === undefined ? undefined : { deadlineAtMs: this.deadlineAtMs }
                )
                const durationMs = Date.now() - startedAt
                this.observer?.recordDatabaseTransaction(durationMs)
                this.observer?.recordProjectionBatch({
                    chars: batch.reduce((total, item) => total + getTextDeltaChars(item.input), 0),
                    items: batch.length,
                    waitMs: durationMs,
                })

                if (committed.length !== batch.length) {
                    throw new Error('Durable projection batch returned an unexpected event count.')
                }

                for (const event of committed) {
                    await this.publishCommitted(event)
                }

                // fail() 可能在 appendEvents / publishCommitted 的 await 期间把 pending 计数清零；
                // 在途 flush 若继续扣减会得到负的 pendingItems / pendingBytes。
                if (this.failure) {
                    return
                }

                this.pendingItems -= batch.length
                this.pendingBytes -= batch.reduce((total, item) => total + item.payloadBytes, 0)
                this.releaseCapacityWaitersIfLow()
            }
        } catch (error) {
            if (!this.failure) {
                this.fail(
                    new DurableStreamProjectionBufferError('PROJECTION_FAILED', 'Durable stream projection failed.', {
                        cause: error,
                    })
                )
            }
            throw this.failure
        }
    }

    private ensureFlushTimer(): void {
        if (this.flushTimer) {
            return
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined
            this.requestFlushWithoutUnhandledRejection()
        }, flushIntervalMs)
    }

    private clearFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer)
            this.flushTimer = undefined
        }
    }

    private isAtHighWater(): boolean {
        return this.pendingItems >= highWaterItems || this.pendingBytes >= highWaterBytes
    }

    private isBelowLowWater(): boolean {
        return this.pendingItems < lowWaterItems && this.pendingBytes < lowWaterBytes
    }

    private waitUntilLowWater(): Promise<void> {
        this.assertOperational()
        if (this.isBelowLowWater()) {
            return Promise.resolve()
        }

        return new Promise<void>((resolve, reject) => {
            this.capacityWaiters.add({ reject, resolve })
        })
    }

    private releaseCapacityWaitersIfLow(): void {
        if (!this.isBelowLowWater()) {
            return
        }

        for (const waiter of this.capacityWaiters) {
            waiter.resolve()
        }
        this.capacityWaiters.clear()
    }

    private assertAccepting(): void {
        this.assertOperational()
        if (this.terminalQueued) {
            throw new DurableStreamProjectionBufferError('PROJECTION_CLOSED', 'Cannot publish after a terminal projection event.')
        }
    }

    private assertOperational(): void {
        if (this.failure) {
            throw this.failure
        }
        if (this.drained) {
            throw new DurableStreamProjectionBufferError('PROJECTION_CLOSED', 'Durable stream projection buffer is drained.')
        }
    }

    private readonly abort = () => {
        if (this.failure || this.drained) {
            return
        }

        this.fail(new DurableStreamProjectionBufferError('PROJECTION_ABORTED', 'Durable stream projection was aborted.'))
    }

    private fail(error: DurableStreamProjectionBufferError): void {
        this.failure = error
        this.flushRequested = false
        this.clearFlushTimer()
        this.pending = []
        this.pendingItems = 0
        this.pendingBytes = 0
        this.signal?.removeEventListener('abort', this.abort)

        for (const waiter of this.capacityWaiters) {
            waiter.reject(error)
        }
        this.capacityWaiters.clear()
    }
}

function getTextPartKey(input: AppendStreamEventInput): string {
    const payload = input.payload
    if (payload.type !== 'text-delta' && payload.type !== 'agent-text-delta') {
        return ''
    }

    return `${input.runId}\u0000${payload.partId}\u0000${payload.type}`
}

function mergeTextDelta(first: AppendStreamEventInput, second: AppendStreamEventInput): AppendStreamEventInput {
    if (!isPublicTextDelta(first) || !isPublicTextDelta(second) || first.payload.type !== second.payload.type) {
        return second
    }

    return {
        ...first,
        payload: {
            ...first.payload,
            delta: first.payload.delta + second.payload.delta,
        },
    }
}

function calculatePayloadBytes(input: AppendStreamEventInput): number {
    return new TextEncoder().encode(JSON.stringify(input.payload)).length
}

function getTextDeltaChars(input: AppendStreamEventInput): number {
    return isPublicTextDelta(input) ? input.payload.delta.length : 0
}

function isPublicTextDelta(
    input: AppendStreamEventInput
): input is AppendStreamEventInput & { payload: Extract<AppendStreamEventInput['payload'], { type: 'agent-text-delta' | 'text-delta' }> } {
    return input.payload.type === 'text-delta' || input.payload.type === 'agent-text-delta'
}
