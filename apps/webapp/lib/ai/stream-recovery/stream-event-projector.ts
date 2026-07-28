import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { chatStreamChunkSchema, streamLifecyclePayloadSchema } from '@/lib/ai/stream-chunk-schema'
import type { StreamEventEnvelopeDto, StreamRunStatusDto, StreamTerminalStateDto } from '@/lib/ai/stream-recovery/contracts'
import { type StreamEventKindDto, StreamEventStore, StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'

export type ProjectChatStreamChunkInput = {
    agentRunId?: string
    runId: string
    ownerSessionHash: string
    chunk: ChatStreamChunk
    runStatus?: StreamRunStatusDto
    terminalState?: StreamTerminalStateDto
}

export type ProjectLifecycleEventInput = {
    agentRunId?: string
    runId: string
    ownerSessionHash: string
    status: StreamRunStatusDto
    code?: string
    message?: string
}

export class StreamEventProjector {
    constructor(private readonly eventStore = new StreamEventStore()) {}

    async projectChunk(input: ProjectChatStreamChunkInput): Promise<StreamEventEnvelopeDto> {
        const parsedChunk = chatStreamChunkSchema.safeParse(input.chunk)

        if (!parsedChunk.success) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Chat stream chunk is not a public stream DTO.')
        }

        const publicChunk = sanitizePublicPayload(parsedChunk.data as ChatStreamChunk)
        assertPublicPayload(publicChunk)

        const terminalState = input.terminalState ?? inferTerminalState(publicChunk)
        const runStatus = input.runStatus ?? inferRunStatus(publicChunk, terminalState)

        return this.eventStore.appendEvent({
            ...(input.agentRunId || extractChunkRunId(publicChunk)
                ? { agentRunId: input.agentRunId ?? extractChunkRunId(publicChunk) }
                : {}),
            eventKind: inferEventKind(publicChunk, terminalState),
            ownerSessionHash: input.ownerSessionHash,
            payload: publicChunk as StreamEventEnvelopeDto['payload'],
            runId: input.runId,
            ...(runStatus ? { runStatus } : {}),
            ...(terminalState ? { terminalState } : {}),
        })
    }

    async projectLifecycle(input: ProjectLifecycleEventInput): Promise<StreamEventEnvelopeDto> {
        const payload = sanitizePublicPayload(
            streamLifecyclePayloadSchema.parse({
                code: input.code,
                message: input.message,
                status: input.status,
                type: 'run-status',
            })
        )

        assertPublicPayload(payload)

        return this.eventStore.appendEvent({
            ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
            eventKind: terminalLifecycleStatuses.has(input.status) ? 'terminal' : 'lifecycle',
            ownerSessionHash: input.ownerSessionHash,
            payload,
            runId: input.runId,
            runStatus: input.status,
            ...(terminalLifecycleStatuses.has(input.status) ? { terminalState: input.status as StreamTerminalStateDto } : {}),
        })
    }
}

function extractChunkRunId(chunk: ChatStreamChunk): string | undefined {
    if ('runId' in chunk && typeof chunk.runId === 'string') {
        return chunk.runId
    }

    return undefined
}

const terminalLifecycleStatuses: ReadonlySet<StreamRunStatusDto> = new Set([
    'completed',
    'failed',
    'cancelled',
    'rejected',
    'version_mismatch',
])

const forbiddenPublicKeys = new Set([
    'apikey',
    'api_key',
    'authorization',
    'checkpoint',
    'cookie',
    'cookies',
    'graphstate',
    'messages',
    'prompt',
    'providererror',
    'rawprovidererror',
    'secret',
    'systemprompt',
    'token',
])

const secretLikePatterns = [
    /\bbearer\s+(?!\[redacted\])[a-z0-9._-]+\b/i,
    /\bsk-(?!\[redacted\])[a-z0-9_-]{8,}\b/i,
    /\b(?:[a-z0-9]+_)*api[_-]?key\s*[:=]\s*(?!\[redacted\])[^\s,;]+/i,
]

const secretLikeRedactions: Array<[RegExp, string]> = [
    [/\bbearer\s+[a-z0-9._-]+\b/gi, 'Bearer [REDACTED]'],
    [/\bsk-[a-z0-9_-]{8,}\b/gi, 'sk-[REDACTED]'],
    [/\b((?:[a-z0-9]+_)*api[_-]?key\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]'],
]

function inferEventKind(chunk: ChatStreamChunk, terminalState: StreamTerminalStateDto | undefined): StreamEventKindDto {
    if (terminalState) {
        return 'terminal'
    }

    if (chunk.type === 'agent-interrupt' || chunk.type === 'agent-resume') {
        return 'lifecycle'
    }

    return 'chunk'
}

function inferRunStatus(chunk: ChatStreamChunk, terminalState: StreamTerminalStateDto | undefined): StreamRunStatusDto | undefined {
    if (terminalState) {
        return terminalState
    }

    if (chunk.type === 'agent-interrupt') {
        return 'paused'
    }

    if (chunk.type === 'agent-resume') {
        return 'running'
    }

    return undefined
}

function inferTerminalState(chunk: ChatStreamChunk): StreamTerminalStateDto | undefined {
    if (chunk.type === 'finish') {
        return 'completed'
    }

    // Tool、Resource、Prompt 错误是可继续执行的局部事件；请求级和 runtime 级错误才会收口当前 run。
    if (chunk.type === 'error' && (chunk.scope === 'request' || chunk.scope === 'runtime')) {
        return 'failed'
    }

    return undefined
}

function assertPublicPayload(value: unknown): void {
    visitPublicPayload(value)
}

function sanitizePublicPayload<T>(value: T): T {
    if (typeof value === 'string') {
        return redactSecretLikeContent(value) as T
    }

    if (Array.isArray(value)) {
        return value.map(item => sanitizePublicPayload(item)) as T
    }

    if (!value || typeof value !== 'object') {
        return value
    }

    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, sanitizePublicPayload(nestedValue)])) as T
}

function redactSecretLikeContent(value: string): string {
    return secretLikeRedactions.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), value)
}

function visitPublicPayload(value: unknown): void {
    if (typeof value === 'string') {
        if (secretLikePatterns.some(pattern => pattern.test(value))) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Public stream payload contains secret-like data.')
        }

        return
    }

    if (!value || typeof value !== 'object') {
        return
    }

    if (Array.isArray(value)) {
        value.forEach(visitPublicPayload)
        return
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        if (forbiddenPublicKeys.has(key.toLowerCase())) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Public stream payload contains forbidden runtime data.')
        }

        visitPublicPayload(nestedValue)
    }
}
