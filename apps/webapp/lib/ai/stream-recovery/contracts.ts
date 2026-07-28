import {
    streamEventKinds,
    streamProtocolProfile,
    streamProtocolVersion,
    streamRunStatuses,
    streamTerminalStates,
} from '@ai-mind/stream-core/protocol'
import { z } from 'zod'

import { chatStreamEventEnvelopeSchema as streamEventEnvelopeSchema, streamLifecyclePayloadSchema } from '@/lib/ai/stream-chunk-schema'

export const RESUMABLE_STREAM_ACCEPT = `application/x-ndjson; profile="${streamProtocolProfile}"`

export const streamRunStatusSchema = z.enum(streamRunStatuses)
export const streamTerminalStateSchema = z.enum(streamTerminalStates)
export const streamEventKindSchema = z.enum(streamEventKinds)

export const streamCursorSchema = z
    .object({
        after: z.number().int().nonnegative(),
        lastEventId: z.string().trim().min(1).optional(),
        protocolVersion: z.literal(streamProtocolVersion).optional(),
        runId: z.string().trim().min(1),
    })
    .strict()

export { streamEventEnvelopeSchema, streamLifecyclePayloadSchema }

export const streamApiErrorCodes = [
    'AGENT_INTERRUPT_NOT_PENDING',
    'AGENT_RESUME_FAILED',
    'AGENT_RUN_FORBIDDEN',
    'AGENT_RUN_NOT_FOUND',
    'AGENT_RUN_NOT_PAUSED',
    'AGENT_RUN_VERSION_MISMATCH',
    'CURSOR_AHEAD',
    'CURSOR_EXPIRED',
    'IDEMPOTENCY_CONFLICT',
    'INVALID_AGENT_REVIEW_DECISION',
    'INVALID_CHAT_REQUEST',
    'INVALID_CURSOR',
    'INVALID_IDEMPOTENCY_KEY',
    'STREAM_RUN_FORBIDDEN',
    'STREAM_RUN_NOT_FOUND',
    'STREAM_SERVICE_UNAVAILABLE',
    'VERSION_MISMATCH',
] as const

export const streamApiErrorCodeSchema = z.enum(streamApiErrorCodes)

export const safeStreamDiagnosticsSchema = z
    .object({
        diagnosticId: z.string().trim().min(1).max(128),
        runId: z.string().trim().min(1).optional(),
        requestId: z.string().trim().min(1).optional(),
        eventId: z.string().trim().min(1).optional(),
        sequence: z.number().int().positive().optional(),
        status: streamRunStatusSchema.optional(),
        errorCode: streamApiErrorCodeSchema.optional(),
        retryable: z.boolean(),
    })
    .strict()

export const streamApiErrorResponseSchema = z
    .object({
        code: streamApiErrorCodeSchema,
        error: z.string().trim().min(1).max(512).optional(),
        message: z.string().trim().min(1).max(512).optional(),
        diagnostics: safeStreamDiagnosticsSchema,
        canRestart: z.boolean().optional(),
        canRetrieveFinalState: z.boolean().optional(),
        earliestRetainedSequence: z.number().int().positive().optional(),
        lastSequence: z.number().int().nonnegative().optional(),
        publicFailureMessage: z.string().trim().min(1).max(1000).optional(),
        recoveryUnavailable: z.boolean().optional(),
        runId: z.string().trim().min(1).optional(),
        runStatus: streamRunStatusSchema.optional(),
        terminalSequence: z.number().int().positive().optional(),
    })
    .strict()
    .refine(value => Boolean(value.error ?? value.message), {
        message: 'A public stream error response must include error or message.',
    })

export const streamReplayDescriptorSchema = z
    .object({
        kind: z.literal('stream-replay'),
        replayed: z.literal(true),
        runId: z.string().trim().min(1),
        status: streamRunStatusSchema,
        lastSequence: z.number().int().nonnegative(),
        streamUrl: z.string().trim().min(1),
    })
    .strict()

export const streamOwnerContextSchema = z
    .object({
        ownerSessionHash: z.string().regex(/^[a-f0-9]{64}$/),
        runId: z.string().trim().min(1),
    })
    .strict()

export const streamRetryPolicy = {
    initialDelayMs: 500,
    jitterRatio: 0.2,
    maxAttempts: 8,
    maxDelayMs: 8_000,
    multiplier: 2,
    totalBudgetMs: 120_000,
} as const

export type StreamApiErrorCode = z.infer<typeof streamApiErrorCodeSchema>
export type StreamApiErrorResponse = z.infer<typeof streamApiErrorResponseSchema>
export type StreamCursor = z.infer<typeof streamCursorSchema>
export type StreamEventEnvelopeDto = z.infer<typeof streamEventEnvelopeSchema>
export type StreamReplayDescriptor = z.infer<typeof streamReplayDescriptorSchema>
export type StreamRunStatusDto = z.infer<typeof streamRunStatusSchema>
export type StreamTerminalStateDto = z.infer<typeof streamTerminalStateSchema>

export function createSafeStreamDiagnostics(input: Omit<StreamApiErrorResponse['diagnostics'], 'diagnosticId'>) {
    return safeStreamDiagnosticsSchema.parse({
        diagnosticId: globalThis.crypto?.randomUUID?.() ?? `diag_${Date.now().toString(36)}`,
        ...input,
    })
}
