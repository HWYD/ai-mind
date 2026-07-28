import { describe, expect, it } from 'vitest'

import {
    type StreamEventEnvelope,
    streamEventKinds,
    type StreamLifecyclePayload,
    streamProtocolProfile,
    streamProtocolVersion,
    streamRunStatuses,
    streamTerminalStates,
} from '../../src/protocol'

describe('resumable stream event protocol', () => {
    it('defines a stable protocol version and profile', () => {
        expect(streamProtocolVersion).toBe(1)
        expect(streamProtocolProfile).toBe('ai-mind-resumable-v1')
    })

    it('defines recoverable event kinds and run states', () => {
        expect(streamEventKinds).toEqual(['chunk', 'lifecycle', 'terminal'])
        expect(streamRunStatuses).toEqual(['running', 'paused', 'completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'])
        expect(streamTerminalStates).toEqual(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'])
    })

    it('keeps the business chunk unchanged inside the envelope payload', () => {
        const envelope = {
            protocolVersion: streamProtocolVersion,
            eventId: 'evt_1',
            runId: 'run_1',
            sequence: 1,
            eventKind: 'chunk',
            payload: {
                type: 'text-delta',
                partId: 'answer',
                delta: 'hello',
            },
            terminal: false,
            runStatus: 'running',
        } satisfies StreamEventEnvelope

        expect(envelope.payload).toEqual({
            type: 'text-delta',
            partId: 'answer',
            delta: 'hello',
        })
    })

    it('models paused as lifecycle and completed as terminal metadata', () => {
        const pausedPayload = {
            type: 'run-status',
            status: 'paused',
        } satisfies StreamLifecyclePayload

        const terminalEnvelope = {
            protocolVersion: streamProtocolVersion,
            eventId: 'evt_terminal',
            runId: 'run_1',
            sequence: 2,
            eventKind: 'terminal',
            payload: {
                type: 'finish',
            },
            terminal: true,
            terminalState: 'completed',
        } satisfies StreamEventEnvelope

        expect(pausedPayload.status).toBe('paused')
        expect(terminalEnvelope.terminalState).toBe('completed')
    })
})
