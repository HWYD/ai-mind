import { beforeEach, describe, expect, it } from 'vitest'

import {
    type StreamEventRecord,
    StreamEventStore,
    StreamEventStoreError,
    type StreamRunRecord,
} from '@/lib/ai/stream-recovery/stream-event-store'

const ownerSessionHash = 'a'.repeat(64)
const runId = '11111111-1111-4111-8111-111111111111'
const now = new Date('2026-07-21T10:00:00.000Z')
const retentionUntil = new Date('2026-07-21T10:10:00.000Z')

class FakeStreamRecoveryPrisma {
    deleteManyCalls = 0
    runs = new Map<string, StreamRunRecord>()
    events: StreamEventRecord[] = []
    private transactionQueue = Promise.resolve()

    streamRun = {
        findUnique: async ({ where }: { where: { id: string } }) => this.runs.get(where.id) ?? null,
        update: async ({
            data,
            where,
        }: {
            where: { id: string }
            data: Partial<
                Pick<
                    StreamRunRecord,
                    'agentRunId' | 'completedAt' | 'failureCode' | 'lastSequence' | 'publicFailureMessage' | 'status' | 'terminalSequence'
                >
            >
        }) => {
            const run = this.runs.get(where.id)

            if (!run) {
                throw new Error(`Missing fake stream run ${where.id}`)
            }

            const updated = {
                ...run,
                ...data,
                updatedAt: now,
            }
            this.runs.set(where.id, updated)

            return updated
        },
    }

    streamEvent = {
        create: async ({ data }: { data: Omit<StreamEventRecord, 'createdAt'> }) => {
            const event = {
                ...data,
                createdAt: now,
            }
            this.events.push(event)

            return event
        },
        deleteMany: async ({ where }: { where: { expiresAt?: { lte: Date }; runId?: string; sequence?: { lte: number } } }) => {
            this.deleteManyCalls += 1
            const before = this.events.length
            this.events = this.events.filter(event => {
                if (where.runId && event.runId !== where.runId) {
                    return true
                }

                if (where.sequence && event.sequence > where.sequence.lte) {
                    return true
                }

                if (where.expiresAt && event.expiresAt > where.expiresAt.lte) {
                    return true
                }

                return false
            })

            return {
                count: before - this.events.length,
            }
        },
        findFirst: async ({ orderBy, where }: { where: { runId: string; terminal?: boolean }; orderBy: { sequence: 'asc' | 'desc' } }) => {
            const events = this.events
                .filter(event => event.runId === where.runId && (where.terminal === undefined || event.terminal === where.terminal))
                .sort((first, second) => (orderBy.sequence === 'asc' ? first.sequence - second.sequence : second.sequence - first.sequence))

            return events[0] ?? null
        },
        findMany: async ({
            where,
        }: {
            where: { runId: string; sequence?: { gt: number }; expiresAt?: { gt: Date } }
            orderBy: { sequence: 'asc' }
        }) =>
            this.events
                .filter(
                    event =>
                        event.runId === where.runId &&
                        event.sequence > (where.sequence?.gt ?? 0) &&
                        (!where.expiresAt || event.expiresAt > where.expiresAt.gt)
                )
                .sort((first, second) => first.sequence - second.sequence),
    }

    async $transaction<T>(callback: (transaction: this) => Promise<T>): Promise<T> {
        const result = this.transactionQueue.then(() => callback(this))
        this.transactionQueue = result.then(
            () => undefined,
            () => undefined
        )

        return result
    }
}

function createRun(overrides: Partial<StreamRunRecord> = {}): StreamRunRecord {
    return {
        agentRunId: null,
        cancelRequestedAt: null,
        completedAt: null,
        createdAt: now,
        executionOwnerId: null,
        failureCode: null,
        id: runId,
        kind: 'chat',
        lastSequence: 0,
        maxEventPayloadBytes: 262_144,
        maxRetainedEvents: 20_000,
        ownerSessionHash,
        publicFailureMessage: null,
        retentionUntil,
        status: 'running',
        terminalSequence: null,
        updatedAt: now,
        ...overrides,
    }
}

function createStore(fake: FakeStreamRecoveryPrisma) {
    let nextId = 1

    return new StreamEventStore(fake as never, {
        createEventId: () => `evt_${nextId++}`,
    })
}

describe('stream-event-store', () => {
    let fake: FakeStreamRecoveryPrisma
    let store: StreamEventStore

    beforeEach(() => {
        fake = new FakeStreamRecoveryPrisma()
        fake.runs.set(runId, createRun())
        store = createStore(fake)
    })

    it('allocates monotonic sequences and replays events after a cursor', async () => {
        const first = await store.appendEvent({
            eventKind: 'chunk',
            ownerSessionHash,
            payload: {
                delta: 'hello',
                partId: 'answer',
                type: 'text-delta',
            },
            runId,
            runStatus: 'running',
        })
        const second = await store.appendEvent({
            eventKind: 'lifecycle',
            ownerSessionHash,
            payload: {
                status: 'paused',
                type: 'run-status',
            },
            runId,
            runStatus: 'paused',
        })

        expect(first).toMatchObject({ eventId: 'evt_1', sequence: 1 })
        expect(second).toMatchObject({ eventId: 'evt_2', sequence: 2, runStatus: 'paused' })
        expect(fake.runs.get(runId)).toMatchObject({ lastSequence: 2, status: 'paused' })

        await expect(store.replayEvents({ after: 1, now, ownerSessionHash, runId })).resolves.toMatchObject({
            events: [{ eventId: 'evt_2', sequence: 2 }],
            run: { lastSequence: 2 },
        })
    })

    it('persists terminal metadata and rejects appends after terminal state', async () => {
        await expect(
            store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    type: 'finish',
                },
                runId,
                terminalState: 'completed',
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            sequence: 1,
            terminal: true,
            terminalState: 'completed',
        })
        expect(fake.runs.get(runId)).toMatchObject({
            completedAt: expect.any(Date),
            lastSequence: 1,
            status: 'completed',
            terminalSequence: 1,
        })
        await expect(store.getTerminalEvent({ ownerSessionHash, runId })).resolves.toMatchObject({
            eventKind: 'terminal',
            sequence: 1,
            terminalState: 'completed',
        })

        await expect(
            store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta: 'late',
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_RUN_TERMINAL',
        })
    })

    it('stores the safe failure detail from a terminal error event', async () => {
        await store.appendEvent({
            eventKind: 'chunk',
            ownerSessionHash,
            payload: {
                errorCode: 'RUNTIME_INVARIANT_FAILED',
                message: '流事件无法安全持久化，当前流已失败，请重新发起请求。',
                retryable: false,
                scope: 'runtime',
                stage: 'runtime',
                type: 'error',
            },
            runId,
            terminalState: 'failed',
        })

        expect(fake.runs.get(runId)).toMatchObject({
            failureCode: 'RUNTIME_INVARIANT_FAILED',
            publicFailureMessage: '流事件无法安全持久化，当前流已失败，请重新发起请求。',
            status: 'failed',
        })
    })

    it('links tasklist stream runs to their business AgentRun id', async () => {
        fake.runs.set(runId, createRun({ kind: 'tasklist_agent' }))

        await store.appendEvent({
            agentRunId: runId,
            eventKind: 'lifecycle',
            ownerSessionHash,
            payload: {
                status: 'running',
                type: 'run-status',
            },
            runId,
            runStatus: 'running',
        })

        expect(fake.runs.get(runId)?.agentRunId).toBe(runId)
    })

    it('rejects AgentRun links for non-Tasklist streams before attempting persistence', async () => {
        fake.runs.set(runId, createRun({ kind: 'image_generation' }))

        await expect(
            store.appendEvent({
                agentRunId: runId,
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta: 'invalid link',
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        ).rejects.toMatchObject({ code: 'STREAM_EVENT_INVALID' })

        expect(fake.events).toHaveLength(0)
        expect(fake.runs.get(runId)?.agentRunId).toBeNull()
    })

    it('keeps unique ordered sequences for concurrent append callers', async () => {
        const results = await Promise.all(
            ['one', 'two', 'three', 'four', 'five'].map(delta =>
                store.appendEvent({
                    eventKind: 'chunk',
                    ownerSessionHash,
                    payload: {
                        delta,
                        partId: 'answer',
                        type: 'text-delta',
                    },
                    runId,
                })
            )
        )

        expect(results.map(event => event.sequence)).toEqual([1, 2, 3, 4, 5])
        expect(new Set(results.map(event => event.eventId)).size).toBe(5)
        expect(fake.runs.get(runId)).toMatchObject({
            lastSequence: 5,
        })
    })

    it('fails closed for wrong owner and future cursors', async () => {
        await store.appendEvent({
            eventKind: 'chunk',
            ownerSessionHash,
            payload: {
                delta: 'hello',
                partId: 'answer',
                type: 'text-delta',
            },
            runId,
        })

        await expect(store.replayEvents({ after: 0, now, ownerSessionHash: 'b'.repeat(64), runId })).rejects.toMatchObject({
            code: 'STREAM_RUN_FORBIDDEN',
        })
        await expect(store.replayEvents({ after: 2, now, ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'CURSOR_AHEAD',
        })
    })

    it('rejects expired retention windows and retained-log gaps', async () => {
        fake.runs.set(
            runId,
            createRun({
                lastSequence: 3,
                retentionUntil: new Date('2026-07-21T09:59:00.000Z'),
            })
        )

        await expect(store.replayEvents({ after: 0, now, ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'CURSOR_EXPIRED',
        })

        fake.runs.set(runId, createRun({ lastSequence: 3 }))
        fake.events.push({
            createdAt: now,
            eventKind: 'chunk',
            expiresAt: retentionUntil,
            id: 'evt_3',
            payload: {
                delta: 'third',
                partId: 'answer',
                type: 'text-delta',
            },
            payloadByteLength: 54,
            protocolVersion: 1,
            runId,
            runStatus: 'running',
            sequence: 3,
            terminal: false,
            terminalState: null,
        })

        await expect(store.replayEvents({ after: 1, now, ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'CURSOR_EXPIRED',
            earliestRetainedSequence: 3,
        })
    })

    it('extends active retention from each newly appended event', async () => {
        const eventTime = new Date('2026-07-21T10:09:00.000Z')

        await store.appendEvent({
            eventKind: 'chunk',
            now: eventTime,
            ownerSessionHash,
            payload: {
                delta: 'fresh',
                partId: 'answer',
                type: 'text-delta',
            },
            runId,
        })

        expect(fake.events[0]?.expiresAt).toEqual(new Date('2026-07-21T10:19:00.000Z'))
        expect(fake.runs.get(runId)?.retentionUntil).toEqual(new Date('2026-07-21T10:19:00.000Z'))
        await expect(
            store.replayEvents({
                after: 0,
                now: new Date('2026-07-21T10:11:00.000Z'),
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({ events: [{ sequence: 1 }] })
    })

    it('enforces the per-run payload byte boundary', async () => {
        fake.runs.set(runId, createRun({ maxEventPayloadBytes: 10 }))

        await expect(
            store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta: 'this payload is too large',
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        ).rejects.toBeInstanceOf(StreamEventStoreError)
        await expect(
            store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta: 'this payload is too large',
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_EVENT_PAYLOAD_TOO_LARGE',
        })
    })

    it('trims a bounded batch instead of deleting on every append after the retention limit', async () => {
        fake.runs.set(runId, createRun({ maxRetainedEvents: 200 }))

        for (let sequence = 1; sequence <= 203; sequence += 1) {
            await store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta: String(sequence),
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        }

        expect(fake.deleteManyCalls).toBe(1)
        expect(fake.events).toHaveLength(180 + 2)
        expect(fake.events[0]?.sequence).toBe(22)
        expect(fake.events.at(-1)?.sequence).toBe(203)
    })

    it('trims events to the per-run retained count and reports the earliest retained sequence', async () => {
        fake.runs.set(runId, createRun({ maxRetainedEvents: 2 }))

        for (const delta of ['one', 'two', 'three']) {
            await store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash,
                payload: {
                    delta,
                    partId: 'answer',
                    type: 'text-delta',
                },
                runId,
            })
        }

        expect(fake.events.map(event => event.sequence)).toEqual([2, 3])
        await expect(store.getEarliestRetainedSequence({ ownerSessionHash, runId })).resolves.toBe(2)
        await expect(store.replayEvents({ after: 0, now, ownerSessionHash, runId })).rejects.toMatchObject({
            code: 'CURSOR_EXPIRED',
            earliestRetainedSequence: 2,
        })
        await expect(store.replayEvents({ after: 1, now, ownerSessionHash, runId })).resolves.toMatchObject({
            events: [{ sequence: 2 }, { sequence: 3 }],
        })
    })

    it('cleans up expired events without deleting retained events', async () => {
        fake.events.push(
            {
                createdAt: now,
                eventKind: 'chunk',
                expiresAt: new Date('2026-07-21T09:59:00.000Z'),
                id: 'evt_expired',
                payload: {
                    delta: 'expired',
                    partId: 'answer',
                    type: 'text-delta',
                },
                payloadByteLength: 56,
                protocolVersion: 1,
                runId,
                runStatus: 'running',
                sequence: 1,
                terminal: false,
                terminalState: null,
            },
            {
                createdAt: now,
                eventKind: 'chunk',
                expiresAt: retentionUntil,
                id: 'evt_retained',
                payload: {
                    delta: 'retained',
                    partId: 'answer',
                    type: 'text-delta',
                },
                payloadByteLength: 57,
                protocolVersion: 1,
                runId,
                runStatus: 'running',
                sequence: 2,
                terminal: false,
                terminalState: null,
            }
        )

        await expect(store.deleteExpiredEvents({ now })).resolves.toBe(1)
        expect(fake.events.map(event => event.id)).toEqual(['evt_retained'])
    })
})
