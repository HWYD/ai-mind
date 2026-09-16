import { describe, expect, it } from 'vitest'

import { GeneralReActExecutionGate } from '@/lib/ai/runtime/general-react-agent/execution-gate'
import { GeneralReActObserver } from '@/lib/ai/runtime/general-react-agent/general-react-agent-observer'
import { DurableStreamProjectionBuffer } from '@/lib/ai/stream-recovery/durable-stream-projection-buffer'

const ownerSessionHash = 'a'.repeat(64)

describe('general-react-agent execution lifecycle', () => {
    it('admits eight active runs and rejects the ninth without queueing', () => {
        const gate = new GeneralReActExecutionGate()
        const permits = Array.from({ length: 8 }, () => gate.tryAcquire())

        expect(permits.every(Boolean)).toBe(true)
        expect(gate.tryAcquire()).toBeNull()
        expect(gate.activeCount()).toBe(8)

        permits[0]!.release()
        expect(gate.activeCount()).toBe(7)
        expect(gate.tryAcquire()).not.toBeNull()
        expect(gate.activeCount()).toBe(8)
    })

    it('releasing a permit is idempotent and leaves no active run behind', () => {
        const gate = new GeneralReActExecutionGate()
        const permit = gate.tryAcquire()!

        permit.release()
        permit.release()

        expect(gate.activeCount()).toBe(0)
    })

    it('retains the permit across transport disconnect and releases once after terminal drain', async () => {
        const observer = new GeneralReActObserver()
        const gate = new GeneralReActExecutionGate(observer)
        const permit = gate.tryAcquire()
        expect(permit).not.toBeNull()

        let published = 0
        const buffer = new DurableStreamProjectionBuffer({
            appendEvents: async inputs =>
                inputs.map((input, index) => ({
                    eventId: `event-${index}`,
                    eventKind: input.terminalState ? 'terminal' : input.eventKind,
                    payload: input.payload,
                    protocolVersion: 1 as const,
                    runId: input.runId,
                    sequence: index + 1,
                    ...(input.terminalState ? { terminal: true, terminalState: input.terminalState } : {}),
                })),
            publishCommitted: () => {
                published += 1
            },
            observer,
        })

        await buffer.publish({
            eventKind: 'chunk',
            ownerSessionHash,
            payload: { delta: 'answer', partId: 'answer', type: 'text-delta' },
            runId: 'run-disconnected',
        })
        expect(gate.activeCount()).toBe(1)
        await buffer.publish({
            eventKind: 'terminal',
            ownerSessionHash,
            payload: { type: 'finish' },
            runId: 'run-disconnected',
            terminalState: 'completed',
        })
        await buffer.drain()
        permit!.release()
        permit!.release()

        expect(published).toBe(2)
        expect(gate.activeCount()).toBe(0)
        expect(observer.snapshot().cleanupCount).toBe(0)
    })
})
