import { describe, expect, it } from 'vitest'

import { resolveStreamReconnectDecision } from '@/components/instamind/chat-stream/stream-reconnect'
import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamEventStore } from '@/lib/ai/stream-recovery/stream-event-store'

import { createFakeStreamRun, FakeStreamRecoveryPrisma, testNow, testOwnerSessionHash } from './test-fakes'

describe('all streams control state integration', () => {
    it.each([
        ['run_chat', 'chat'],
        ['run_tasklist', 'tasklist_agent'],
        ['run_delivery', 'delivery_chain'],
    ] as const)('projects explicit cancel as terminal state for %s', async (runId, kind) => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set(runId, createFakeStreamRun(runId, kind))
        const store = new StreamEventStore(fake as never, { createEventId: () => `evt_cancel_${kind}` })
        const projector = new StreamEventProjector(store)

        await expect(
            projector.projectLifecycle({
                code: 'USER_CANCELLED',
                message: 'Cancelled by user.',
                ownerSessionHash: testOwnerSessionHash,
                runId,
                status: 'cancelled',
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            terminal: true,
            terminalState: 'cancelled',
        })
        await expect(
            store.appendEvent({
                eventKind: 'chunk',
                ownerSessionHash: testOwnerSessionHash,
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

    it('fails closed for cursor expiry, permission failure and permanent no-retry states', async () => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set(
            'run_chat',
            createFakeStreamRun('run_chat', 'chat', {
                lastSequence: 1,
                retentionUntil: new Date('2026-07-21T09:59:00.000Z'),
            })
        )
        const store = new StreamEventStore(fake as never)

        await expect(
            store.replayEvents({ after: 0, now: testNow, ownerSessionHash: testOwnerSessionHash, runId: 'run_chat' })
        ).rejects.toMatchObject({
            code: 'CURSOR_EXPIRED',
        })
        await expect(
            store.replayEvents({ after: 0, now: testNow, ownerSessionHash: 'b'.repeat(64), runId: 'run_chat' })
        ).rejects.toMatchObject({
            code: 'STREAM_RUN_FORBIDDEN',
        })
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0, errorCode: 'CURSOR_EXPIRED' })).toEqual({
            reason: 'permanent_error',
            retry: false,
        })
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0, errorCode: 'STREAM_RUN_FORBIDDEN' })).toEqual({
            reason: 'permanent_error',
            retry: false,
        })
        expect(resolveStreamReconnectDecision({ attempt: 8, elapsedMs: 119_000 })).toEqual({
            reason: 'attempts_exhausted',
            retry: false,
        })
    })
})
