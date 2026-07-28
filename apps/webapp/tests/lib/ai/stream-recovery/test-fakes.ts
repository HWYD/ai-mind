import type { StreamEventRecord, StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'
import type { StreamRequestRecord } from '@/lib/ai/stream-recovery/stream-run-service'

export const testOwnerSessionHash = 'a'.repeat(64)
export const testNow = new Date('2026-07-21T10:00:00.000Z')
export const testRetentionUntil = new Date('2026-07-21T10:10:00.000Z')

export class FakeStreamRecoveryPrisma {
    requests = new Map<string, StreamRequestRecord>()
    runs = new Map<string, StreamRunRecord>()
    events: StreamEventRecord[] = []
    private nextRequestId = 1
    private nextRunId = 1
    private transactionQueue = Promise.resolve()

    streamRequest = {
        create: async ({
            data,
        }: {
            data: {
                id?: string
                ownerSessionHash: string
                idempotencyKey: string
                requestFingerprint: string
                runId: string
                expiresAt: Date
            }
        }) => {
            const key = this.requestKey(data.ownerSessionHash, data.idempotencyKey)

            if (this.requests.has(key)) {
                throw new Error(`Duplicate fake StreamRequest ${key}`)
            }

            const request: StreamRequestRecord = {
                createdAt: testNow,
                expiresAt: data.expiresAt,
                id: data.id ?? `request_${this.nextRequestId++}`,
                idempotencyKey: data.idempotencyKey,
                ownerSessionHash: data.ownerSessionHash,
                requestFingerprint: data.requestFingerprint,
                runId: data.runId,
            }
            this.requests.set(key, request)

            return request
        },
        deleteMany: async ({ where }: { where: { id: string } }) => {
            const before = this.requests.size

            for (const [key, request] of this.requests) {
                if (request.id === where.id) {
                    this.requests.delete(key)
                }
            }

            return {
                count: before - this.requests.size,
            }
        },
        findUnique: async ({
            include,
            where,
        }: {
            include?: { run: boolean }
            where: {
                ownerSessionHash_idempotencyKey: {
                    ownerSessionHash: string
                    idempotencyKey: string
                }
            }
        }) => {
            const request = this.requests.get(
                this.requestKey(
                    where.ownerSessionHash_idempotencyKey.ownerSessionHash,
                    where.ownerSessionHash_idempotencyKey.idempotencyKey
                )
            )

            if (!request) {
                return null
            }

            return include?.run
                ? {
                      ...request,
                      run: this.runs.get(request.runId),
                  }
                : request
        },
    }

    streamRun = {
        create: async ({
            data,
        }: {
            data: {
                id?: string
                kind: StreamRunRecord['kind']
                ownerSessionHash: string
                agentRunId?: string
                status: StreamRunRecord['status']
                retentionUntil: Date
                maxRetainedEvents: number
                maxEventPayloadBytes: number
            }
        }) => {
            const id = data.id ?? `run_${this.nextRunId++}`
            const run = createFakeStreamRun(id, data.kind, {
                agentRunId: data.agentRunId ?? null,
                maxEventPayloadBytes: data.maxEventPayloadBytes,
                maxRetainedEvents: data.maxRetainedEvents,
                ownerSessionHash: data.ownerSessionHash,
                retentionUntil: data.retentionUntil,
                status: data.status,
            })
            this.runs.set(id, run)

            return run
        },
        findUnique: async ({ where }: { where: { id: string } }) => this.runs.get(where.id) ?? null,
        update: async ({
            data,
            where,
        }: {
            where: { id: string }
            data: Partial<Pick<StreamRunRecord, 'completedAt' | 'lastSequence' | 'status' | 'terminalSequence'>>
        }) => {
            const run = this.runs.get(where.id)

            if (!run) {
                throw new Error(`Missing fake stream run ${where.id}`)
            }

            const updated = {
                ...run,
                ...data,
                updatedAt: testNow,
            }
            this.runs.set(where.id, updated)

            return updated
        },
    }

    streamEvent = {
        create: async ({ data }: { data: Omit<StreamEventRecord, 'createdAt'> }) => {
            const event = {
                ...data,
                createdAt: testNow,
            }
            this.events.push(event)

            return event
        },
        deleteMany: async ({ where }: { where: { expiresAt?: { lte: Date }; runId?: string; sequence?: { lte: number } } }) => {
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
        findMany: async ({ where }: { where: { runId: string; sequence?: { gt: number } }; orderBy: { sequence: 'asc' } }) =>
            this.events
                .filter(event => event.runId === where.runId && event.sequence > (where.sequence?.gt ?? 0))
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

    requestKey(owner: string, key: string): string {
        return `${owner}:${key}`
    }
}

export function createFakeStreamRun(id: string, kind: StreamRunRecord['kind'], overrides: Partial<StreamRunRecord> = {}): StreamRunRecord {
    return {
        agentRunId: null,
        cancelRequestedAt: null,
        completedAt: null,
        createdAt: testNow,
        executionOwnerId: null,
        failureCode: null,
        id,
        kind,
        lastSequence: 0,
        maxEventPayloadBytes: 262_144,
        maxRetainedEvents: 20_000,
        ownerSessionHash: testOwnerSessionHash,
        publicFailureMessage: null,
        retentionUntil: testRetentionUntil,
        status: 'running',
        terminalSequence: null,
        updatedAt: testNow,
        ...overrides,
    }
}
