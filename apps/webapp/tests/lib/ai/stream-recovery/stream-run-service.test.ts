import { beforeEach, describe, expect, it } from 'vitest'

import type { StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'
import { createRequestFingerprint, type StreamRequestRecord, StreamRunService } from '@/lib/ai/stream-recovery/stream-run-service'

const ownerSessionHash = 'a'.repeat(64)
const now = new Date('2026-07-21T10:00:00.000Z')
const retentionUntil = new Date('2026-07-21T10:10:00.000Z')

class FakeStreamRunPrisma {
    requests = new Map<string, StreamRequestRecord>()
    runs = new Map<string, StreamRunRecord>()
    private nextRequestId = 1
    private nextRunId = 1

    streamRequest = {
        create: async ({
            data,
        }: {
            data: {
                ownerSessionHash: string
                idempotencyKey: string
                requestFingerprint: string
                runId: string
                expiresAt: Date
            }
        }) => {
            const request = {
                createdAt: now,
                id: `request_${this.nextRequestId++}`,
                ...data,
            }
            this.requests.set(this.requestKey(data.ownerSessionHash, data.idempotencyKey), request)

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
                kind: 'chat' | 'tasklist_agent' | 'delivery_chain'
                ownerSessionHash: string
                agentRunId?: string
                status: 'running'
                retentionUntil: Date
                maxRetainedEvents: number
                maxEventPayloadBytes: number
            }
        }) => {
            const id = data.id ?? `run_${this.nextRunId++}`
            const run: StreamRunRecord = {
                agentRunId: data.agentRunId ?? null,
                cancelRequestedAt: null,
                completedAt: null,
                createdAt: now,
                executionOwnerId: null,
                failureCode: null,
                id,
                kind: data.kind,
                lastSequence: 0,
                maxEventPayloadBytes: data.maxEventPayloadBytes,
                maxRetainedEvents: data.maxRetainedEvents,
                ownerSessionHash: data.ownerSessionHash,
                publicFailureMessage: null,
                retentionUntil: data.retentionUntil,
                status: data.status,
                terminalSequence: null,
                updatedAt: now,
            }
            this.runs.set(id, run)

            return run
        },
        findUnique: async ({ where }: { where: { id: string } }) => this.runs.get(where.id) ?? null,
    }

    async $transaction<T>(callback: (transaction: this) => Promise<T>): Promise<T> {
        return callback(this)
    }

    requestKey(owner: string, key: string): string {
        return `${owner}:${key}`
    }
}

describe('stream-run-service', () => {
    let fake: FakeStreamRunPrisma
    let service: StreamRunService

    beforeEach(() => {
        fake = new FakeStreamRunPrisma()
        service = new StreamRunService(fake as never)
    })

    it('creates one StreamRequest and StreamRun for a new idempotency key', async () => {
        const result = await service.createOrReuseRun({
            idempotencyKey: ' request-key-1 ',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                message: 'hello',
                modelId: 'ollama/qwen3',
            },
        })

        expect(result).toMatchObject({
            run: {
                kind: 'chat',
                lastSequence: 0,
                ownerSessionHash,
                status: 'running',
            },
            streamUrl: '/api/chat/runs/run_1/stream',
            type: 'created',
        })
        expect(fake.requests.get(fake.requestKey(ownerSessionHash, 'request-key-1'))).toMatchObject({
            runId: 'run_1',
        })
    })

    it('returns a replay descriptor for the same key and same canonical fingerprint', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'same-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                a: 1,
                b: 2,
            },
        })
        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            lastSequence: 42,
            status: 'paused',
        })

        const result = await service.createOrReuseRun({
            idempotencyKey: 'same-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                b: 2,
                a: 1,
            },
        })

        expect(result).toMatchObject({
            descriptor: {
                kind: 'stream-replay',
                lastSequence: 42,
                replayed: true,
                runId: 'run_1',
                status: 'paused',
                streamUrl: '/api/chat/runs/run_1/stream',
            },
            type: 'replay',
        })
        expect(fake.runs).toHaveLength(1)
    })

    it('rejects duplicate idempotency keys with different fingerprints', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'conflict-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                message: 'first',
            },
        })

        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'conflict-key',
                kind: 'chat',
                now,
                ownerSessionHash,
                request: {
                    message: 'second',
                },
            })
        ).rejects.toMatchObject({
            code: 'IDEMPOTENCY_CONFLICT',
        })
    })

    it('allows a terminal expired idempotency scope to start a new bounded scope', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'expired-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                message: 'first',
            },
        })
        fake.requests.set(fake.requestKey(ownerSessionHash, 'expired-key'), {
            ...fake.requests.get(fake.requestKey(ownerSessionHash, 'expired-key'))!,
            expiresAt: new Date('2026-07-21T09:58:00.000Z'),
        })
        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            retentionUntil: new Date('2026-07-21T09:59:00.000Z'),
            status: 'completed',
            terminalSequence: 3,
        })

        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'expired-key',
                kind: 'chat',
                now,
                ownerSessionHash,
                request: {
                    message: 'second',
                },
            })
        ).resolves.toMatchObject({
            run: {
                id: 'run_2',
            },
            type: 'created',
        })
    })

    it('validates ownership, future cursors and expired cursors', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'cursor-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                message: 'hello',
            },
        })
        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            lastSequence: 2,
        })

        await expect(service.validateCursor({ after: 2, now, ownerSessionHash, runId: 'run_1' })).resolves.toMatchObject({
            id: 'run_1',
        })
        await expect(service.validateCursor({ after: 0, now, ownerSessionHash: 'b'.repeat(64), runId: 'run_1' })).rejects.toMatchObject({
            code: 'STREAM_RUN_FORBIDDEN',
        })
        await expect(service.validateCursor({ after: 3, now, ownerSessionHash, runId: 'run_1' })).rejects.toMatchObject({
            code: 'CURSOR_AHEAD',
        })
        await expect(
            service.validateCursor({
                after: 1,
                now: new Date('2026-07-21T10:11:00.000Z'),
                ownerSessionHash,
                runId: 'run_1',
            })
        ).rejects.toMatchObject({
            code: 'CURSOR_EXPIRED',
        })
    })

    it('returns safe final-state fields without exposing owner or request fingerprint', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'final-key',
            kind: 'chat',
            now,
            ownerSessionHash,
            request: {
                message: 'hello',
            },
        })
        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            failureCode: 'MODEL_RUNTIME_FAILED',
            lastSequence: 5,
            publicFailureMessage: 'Model failed.',
            status: 'failed',
            terminalSequence: 5,
        })

        const finalState = await service.getSafeFinalState({ now, ownerSessionHash, runId: 'run_1' })

        expect(finalState).toEqual({
            canRestart: true,
            canRetrieveFinalState: true,
            failureCode: 'MODEL_RUNTIME_FAILED',
            lastSequence: 5,
            publicFailureMessage: 'Model failed.',
            runId: 'run_1',
            status: 'failed',
            terminalSequence: 5,
        })
        expect(finalState).not.toHaveProperty('ownerSessionHash')
        expect(finalState).not.toHaveProperty('requestFingerprint')
    })

    it('creates stable request fingerprints for semantically identical objects', () => {
        expect(createRequestFingerprint({ kind: 'chat', request: { a: 1, b: [2, 3] } })).toBe(
            createRequestFingerprint({ request: { b: [2, 3], a: 1 }, kind: 'chat' })
        )
    })
})
