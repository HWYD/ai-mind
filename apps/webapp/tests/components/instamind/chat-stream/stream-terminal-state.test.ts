import { describe, expect, it } from 'vitest'

import { resolveStreamReconnectDecision } from '@/components/instamind/chat-stream/stream-reconnect'
import { streamEventEnvelopeSchema } from '@/lib/ai/stream-recovery/contracts'

describe('stream terminal and recoverable states', () => {
    it.each(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'] as const)(
        'accepts %s as a terminal envelope state',
        terminalState => {
            expect(
                streamEventEnvelopeSchema.parse({
                    eventId: `evt_${terminalState}`,
                    eventKind: 'terminal',
                    payload: {
                        type: terminalState === 'completed' ? 'finish' : 'run-status',
                        ...(terminalState === 'completed' ? {} : { status: terminalState }),
                    },
                    protocolVersion: 1,
                    runId: 'run_1',
                    runStatus: terminalState,
                    sequence: 1,
                    terminal: true,
                    terminalState,
                })
            ).toMatchObject({
                terminal: true,
                terminalState,
            })
        }
    )

    it('treats cursor expired and version mismatch as permanent recovery stops', () => {
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0, errorCode: 'CURSOR_EXPIRED' })).toEqual({
            reason: 'permanent_error',
            retry: false,
        })
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0, errorCode: 'VERSION_MISMATCH' })).toEqual({
            reason: 'permanent_error',
            retry: false,
        })
    })

    it('keeps paused HITL waiting as a non-terminal recoverable lifecycle state', () => {
        const paused = streamEventEnvelopeSchema.parse({
            eventId: 'evt_paused',
            eventKind: 'lifecycle',
            payload: {
                status: 'paused',
                type: 'run-status',
            },
            protocolVersion: 1,
            runId: 'run_1',
            runStatus: 'paused',
            sequence: 7,
        })

        expect(paused).toMatchObject({
            eventKind: 'lifecycle',
            runStatus: 'paused',
        })
        expect(paused).not.toHaveProperty('terminal')
        expect(resolveStreamReconnectDecision({ attempt: 0, elapsedMs: 0 })).toMatchObject({
            retry: true,
        })
    })
})
