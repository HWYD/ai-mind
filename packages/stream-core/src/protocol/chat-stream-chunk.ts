export interface StartChunk {
    type: 'start'
    messageId: string
}

export interface TextStartChunk {
    type: 'text-start'
    partId: string
}

export interface TextDeltaChunk {
    type: 'text-delta'
    partId: string
    delta: string
}

export interface TextEndChunk {
    type: 'text-end'
    partId: string
}

export interface ReasoningStartChunk {
    type: 'reasoning-start'
    partId: string
}

export interface ReasoningDeltaChunk {
    type: 'reasoning-delta'
    partId: string
    delta: string
}

export interface ReasoningEndChunk {
    type: 'reasoning-end'
    partId: string
}

export interface ToolStartChunk {
    type: 'tool-start'
    partId: string
    toolName: string
    title?: string
    action?: string
    source?: 'internal' | 'mcp'
    serverId?: string
    input: string
}

export interface ToolEndChunk {
    type: 'tool-end'
    partId: string
    toolName: string
    title?: string
    action?: string
    source?: 'internal' | 'mcp'
    serverId?: string
    input: string
    output: string
}

export interface ResourceStartChunk {
    type: 'resource-start'
    partId: string
    resourceName: string
    uri: string
    serverId: string
}

export interface ResourceEndChunk {
    type: 'resource-end'
    partId: string
    resourceName: string
    uri: string
    serverId: string
    contentPreview?: string
    isTruncated?: boolean
    previewChars?: number
}

export const streamErrorScopes = ['tool', 'resource', 'runtime', 'request'] as const
export type StreamErrorScope = (typeof streamErrorScopes)[number]

export const streamErrorStages = ['planning', 'tool-execution', 'final-answer', 'runtime'] as const
export type StreamErrorStage = (typeof streamErrorStages)[number]

export const streamErrorCodes = [
    'REQUEST_ABORTED',
    'INVALID_SKILL',
    'MODEL_STREAM_FAILED',
    'TOOL_VALIDATION_FAILED',
    'TOOL_EXECUTION_FAILED',
    'RUNTIME_INVARIANT_FAILED',
] as const
export type StreamErrorCode = (typeof streamErrorCodes)[number]

export interface FinishChunk {
    type: 'finish'
}

export interface ErrorChunk {
    type: 'error'
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
    serverId?: string
    input?: string
}

export type ChatStreamChunk =
    | StartChunk
    | TextStartChunk
    | TextDeltaChunk
    | TextEndChunk
    | ReasoningStartChunk
    | ReasoningDeltaChunk
    | ReasoningEndChunk
    | ToolStartChunk
    | ToolEndChunk
    | ResourceStartChunk
    | ResourceEndChunk
    | FinishChunk
    | ErrorChunk
