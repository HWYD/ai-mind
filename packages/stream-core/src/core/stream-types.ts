import type { ChatStreamChunk } from '../protocol'

export interface StreamExecutionContext {
    signal?: AbortSignal
}

export type WriteChunk = (chunk: ChatStreamChunk) => void
