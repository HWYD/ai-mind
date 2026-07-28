import { beforeEach, describe, expect, it } from 'vitest'

import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamEventStore } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamRunService } from '@/lib/ai/stream-recovery/stream-run-service'

import { FakeStreamRecoveryPrisma, testNow, testOwnerSessionHash } from './test-fakes'

describe('three stream idempotency', () => {
    let fake: FakeStreamRecoveryPrisma
    let service: StreamRunService
    let projector: StreamEventProjector

    beforeEach(() => {
        fake = new FakeStreamRecoveryPrisma()
        service = new StreamRunService(fake as never)
        let nextEventId = 1
        projector = new StreamEventProjector(
            new StreamEventStore(fake as never, {
                createEventId: () => `evt_${nextEventId++}`,
            })
        )
    })

    it('keeps request identity, run identity and event sequences isolated for all current stream kinds', async () => {
        const streamRequests = [
            { idempotencyKey: 'chat-key', kind: 'chat' as const, request: { conversationId: 'chat', message: 'hello' } },
            {
                idempotencyKey: 'tasklist-key',
                kind: 'tasklist_agent' as const,
                request: { conversationId: 'tasklist', message: 'make tasks' },
            },
            {
                idempotencyKey: 'delivery-key',
                kind: 'delivery_chain' as const,
                request: { conversationId: 'delivery', message: 'make delivery plan' },
            },
        ]

        for (const streamRequest of streamRequests) {
            const created = await service.createOrReuseRun({
                ...streamRequest,
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
            })
            const replayed = await service.createOrReuseRun({
                ...streamRequest,
                now: testNow,
                ownerSessionHash: testOwnerSessionHash,
            })

            expect(created).toMatchObject({
                run: {
                    kind: streamRequest.kind,
                },
                type: 'created',
            })
            expect(replayed).toMatchObject({
                descriptor: {
                    runId: created.request.runId,
                },
                type: 'replay',
            })

            await projector.projectChunk({
                chunk: { type: 'start', messageId: `assistant-${streamRequest.kind}` },
                ownerSessionHash: testOwnerSessionHash,
                runId: created.request.runId,
            })
            await projector.projectChunk({
                chunk: { type: 'finish' },
                ownerSessionHash: testOwnerSessionHash,
                runId: created.request.runId,
            })
        }

        expect([...fake.runs.values()].map(run => [run.id, run.kind, run.lastSequence])).toEqual([
            ['run_1', 'chat', 2],
            ['run_2', 'tasklist_agent', 2],
            ['run_3', 'delivery_chain', 2],
        ])
        expect(
            ['run_1', 'run_2', 'run_3'].map(runId => fake.events.filter(event => event.runId === runId).map(event => event.sequence))
        ).toEqual([
            [1, 2],
            [1, 2],
            [1, 2],
        ])
        expect(fake.requests).toHaveLength(3)
        expect(fake.events).toHaveLength(6)
    })
})
