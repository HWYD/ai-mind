import { describe, expect, it } from 'vitest'

import {
    RESUMABLE_STREAM_ACCEPT,
    safeStreamDiagnosticsSchema,
    streamApiErrorResponseSchema,
    streamCursorSchema,
    streamEventEnvelopeSchema,
    streamReplayDescriptorSchema,
    streamRetryPolicy,
} from '@/lib/ai/stream-recovery/contracts'

describe('stream recovery contracts', () => {
    it('accepts a valid resumable envelope with unchanged chunk payload', () => {
        const parsed = streamEventEnvelopeSchema.safeParse({
            protocolVersion: 1,
            eventId: 'evt_1',
            runId: 'run_1',
            sequence: 1,
            eventKind: 'chunk',
            runStatus: 'running',
            payload: {
                type: 'text-delta',
                partId: 'answer',
                delta: 'hello',
            },
        })

        expect(parsed.success).toBe(true)
    })

    it('requires terminal metadata for terminal event kind', () => {
        expect(
            streamEventEnvelopeSchema.safeParse({
                protocolVersion: 1,
                eventId: 'evt_1',
                runId: 'run_1',
                sequence: 1,
                eventKind: 'terminal',
                payload: {
                    type: 'finish',
                },
            }).success
        ).toBe(false)

        expect(
            streamEventEnvelopeSchema.safeParse({
                protocolVersion: 1,
                eventId: 'evt_1',
                runId: 'run_1',
                sequence: 1,
                eventKind: 'terminal',
                terminal: true,
                terminalState: 'completed',
                payload: {
                    type: 'finish',
                },
            }).success
        ).toBe(true)
    })

    it('accepts paused as non-terminal lifecycle state', () => {
        expect(
            streamEventEnvelopeSchema.safeParse({
                protocolVersion: 1,
                eventId: 'evt_paused',
                runId: 'run_1',
                sequence: 2,
                eventKind: 'lifecycle',
                runStatus: 'paused',
                payload: {
                    type: 'run-status',
                    status: 'paused',
                },
            }).success
        ).toBe(true)
    })

    it('validates cursor, replay descriptor and retry defaults', () => {
        expect(
            streamCursorSchema.safeParse({
                runId: 'run_1',
                after: 42,
                lastEventId: 'evt_42',
                protocolVersion: 1,
            }).success
        ).toBe(true)

        expect(
            streamReplayDescriptorSchema.safeParse({
                kind: 'stream-replay',
                replayed: true,
                runId: 'run_1',
                status: 'running',
                lastSequence: 42,
                streamUrl: '/api/chat/runs/run_1/stream',
            }).success
        ).toBe(true)

        expect(RESUMABLE_STREAM_ACCEPT).toBe('application/x-ndjson; profile="ai-mind-resumable-v1"')
        expect(streamRetryPolicy).toMatchObject({
            initialDelayMs: 500,
            multiplier: 2,
            maxDelayMs: 8_000,
            jitterRatio: 0.2,
            maxAttempts: 8,
            totalBudgetMs: 120_000,
        })
    })

    it('keeps diagnostics strict and safe', () => {
        expect(
            safeStreamDiagnosticsSchema.safeParse({
                diagnosticId: 'diag_1',
                runId: 'run_1',
                requestId: 'req_1',
                eventId: 'evt_1',
                sequence: 1,
                status: 'running',
                errorCode: 'CURSOR_EXPIRED',
                retryable: false,
            }).success
        ).toBe(true)

        expect(
            safeStreamDiagnosticsSchema.safeParse({
                diagnosticId: 'diag_1',
                retryable: false,
                rawProviderError: 'secret provider stack',
            }).success
        ).toBe(false)
    })

    it('accepts safe public recovery errors', () => {
        expect(
            streamApiErrorResponseSchema.safeParse({
                code: 'CURSOR_EXPIRED',
                error: 'Recovery cursor is outside the retained window.',
                message: 'Recovery cursor is outside the retained window.',
                diagnostics: {
                    diagnosticId: 'diag_1',
                    runId: 'run_1',
                    status: 'running',
                    errorCode: 'CURSOR_EXPIRED',
                    retryable: false,
                },
                canRetrieveFinalState: true,
                canRestart: true,
                earliestRetainedSequence: 8,
                recoveryUnavailable: true,
                runId: 'run_1',
                runStatus: 'running',
            }).success
        ).toBe(true)
    })
})
