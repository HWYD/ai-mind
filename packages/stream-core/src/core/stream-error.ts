import type { ErrorChunk, StreamErrorCode, StreamErrorScope, StreamErrorStage } from '../protocol'
import type { WriteChunk } from './stream-types'

export interface StreamErrorPayload {
    scope: StreamErrorScope
    errorCode: StreamErrorCode
    retryable: boolean
    message: string
    stage?: StreamErrorStage
    partId?: string
    toolName?: string
    resourceName?: string
    uri?: string
    source?: 'internal' | 'mcp'
    location?: 'local' | 'remote'
    serverId?: string
    input?: string
    promptName?: string
}

export function createStreamErrorChunk(payload: StreamErrorPayload): ErrorChunk {
    return {
        type: 'error',
        ...payload,
    }
}

export function writeStreamErrorChunk(writeChunk: WriteChunk, payload: StreamErrorPayload) {
    writeChunk(createStreamErrorChunk(payload))
}
