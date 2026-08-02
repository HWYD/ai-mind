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

    it('keeps an image result-ready payload non-terminal until the completed envelope arrives', () => {
        const ready = streamEventEnvelopeSchema.parse({
            eventId: 'evt_image_ready',
            eventKind: 'chunk',
            payload: {
                contentPath: '/api/chat/runs/run-image/image',
                expiresAt: '2026-07-05T10:10:00.000Z',
                partId: 'image-result-run-image',
                runId: 'run-image',
                suggestedFileName: 'ai-mind-image-run-image.jpg',
                temporary: true,
                type: 'image-result-ready',
            },
            protocolVersion: 1,
            runId: 'run-image',
            runStatus: 'running',
            sequence: 4,
        })

        expect(ready).toMatchObject({
            eventKind: 'chunk',
            runStatus: 'running',
        })
        expect(ready).not.toHaveProperty('terminal')
    })
})
