import type { ChatStreamChunk } from './chat-stream-chunk'

export const streamProtocolVersion = 1
export const streamProtocolProfile = 'ai-mind-resumable-v1'

export const streamEventKinds = ['chunk', 'lifecycle', 'terminal'] as const
export type StreamEventKind = (typeof streamEventKinds)[number]

export const streamRunStatuses = ['running', 'paused', 'completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'] as const
export type StreamRunStatus = (typeof streamRunStatuses)[number]

export const streamTerminalStates = ['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'] as const
export type StreamTerminalState = (typeof streamTerminalStates)[number]

export interface StreamLifecyclePayload {
    type: 'run-status'
    status: StreamRunStatus
    code?: string
    message?: string
}

export interface StreamTerminalMetadata {
    terminal: true
    terminalState: StreamTerminalState
}

export interface StreamNonTerminalMetadata {
    terminal?: false
    runStatus?: StreamRunStatus
}

export type StreamEventPayload = ChatStreamChunk | StreamLifecyclePayload

export type StreamEventEnvelope<TPayload extends StreamEventPayload = StreamEventPayload> = {
    eventId: string
    eventKind: StreamEventKind
    payload: TPayload
    protocolVersion: typeof streamProtocolVersion
    runId: string
    sequence: number
} & (StreamTerminalMetadata | StreamNonTerminalMetadata)
