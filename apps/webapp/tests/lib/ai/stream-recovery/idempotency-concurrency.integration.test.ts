import { beforeEach, describe, expect, it } from 'vitest'

import { StreamRunService } from '@/lib/ai/stream-recovery/stream-run-service'

import { FakeStreamRecoveryPrisma, testNow, testOwnerSessionHash } from './test-fakes'

describe('stream idempotency concurrency integration', () => {
    let fake: FakeStreamRecoveryPrisma
    let service: StreamRunService

    beforeEach(() => {
        fake = new FakeStreamRecoveryPrisma()
        service = new StreamRunService(fake as never)
    })

    it('serializes concurrent same-key creates into one run and replay descriptors', async () => {
        const results = await Promise.all(
            [1, 2, 3].map(() =>
                service.createOrReuseRun({
                    idempotencyKey: 'same-client-request',
                    kind: 'chat',
                    now: testNow,
                    ownerSessionHash: testOwnerSessionHash,
                    request: {
                        conversationId: 'conversation_1',
                        message: 'hello',
                    },
                })
            )
        )

        expect(results.filter(result => result.type === 'created')).toHaveLength(1)
        expect(results.filter(result => result.type === 'replay')).toHaveLength(2)
        expect(fake.requests).toHaveLength(1)
        expect(fake.runs).toHaveLength(1)
        expect(new Set(results.map(result => result.request.runId))).toEqual(new Set(['run_1']))
    })

    it('keeps active and retained terminal idempotency scopes bounded before allowing a new scope', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'bounded-key',
            kind: 'chat',
            now: testNow,
            ownerSessionHash: testOwnerSessionHash,
            request: {
                message: 'first',
            },
        })
        fake.requests.set(fake.requestKey(testOwnerSessionHash, 'bounded-key'), {
            ...fake.requests.get(fake.requestKey(testOwnerSessionHash, 'bounded-key'))!,
            expiresAt: new Date('2026-07-21T09:58:00.000Z'),
        })

        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'bounded-key',
                kind: 'chat',
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
                request: {
                    message: 'first',
                },
            })
        ).resolves.toMatchObject({
            descriptor: {
                runId: 'run_1',
                status: 'running',
            },
            type: 'replay',
        })

        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            retentionUntil: new Date('2026-07-21T10:05:00.000Z'),
            status: 'completed',
            terminalSequence: 3,
        })
        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'bounded-key',
                kind: 'chat',
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
                request: {
                    message: 'first',
                },
            })
        ).resolves.toMatchObject({
            descriptor: {
                runId: 'run_1',
                status: 'completed',
            },
            type: 'replay',
        })

        fake.runs.set('run_1', {
            ...fake.runs.get('run_1')!,
            retentionUntil: new Date('2026-07-21T09:59:00.000Z'),
        })
        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'bounded-key',
                kind: 'chat',
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
                request: {
                    message: 'second bounded scope',
                },
            })
        ).resolves.toMatchObject({
            run: {
                id: 'run_2',
            },
            type: 'created',
        })
    })

    it('does not replay a same-key request across different stream kinds', async () => {
        await service.createOrReuseRun({
            idempotencyKey: 'same-key-different-kind',
            kind: 'chat',
            now: testNow,
            ownerSessionHash: testOwnerSessionHash,
            request: {
                message: 'hello',
            },
        })

        await expect(
            service.createOrReuseRun({
                idempotencyKey: 'same-key-different-kind',
                kind: 'delivery_chain',
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
                request: {
                    message: 'hello',
                },
            })
        ).rejects.toMatchObject({
            code: 'IDEMPOTENCY_CONFLICT',
        })
    })
})
