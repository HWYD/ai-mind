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

export interface ToolErrorChunk {
    type: 'tool-error'
    partId: string
    toolName: string
    title?: string
    action?: string
    source?: 'internal' | 'mcp'
    serverId?: string
    input: string
    message: string
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

export interface ResourceErrorChunk {
    type: 'resource-error'
    partId: string
    resourceName: string
    uri: string
    serverId: string
    message: string
}

export interface FinishChunk {
    type: 'finish'
}

export interface ErrorChunk {
    type: 'error'
    message: string
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
    | ToolErrorChunk
    | ResourceStartChunk
    | ResourceEndChunk
    | ResourceErrorChunk
    | FinishChunk
    | ErrorChunk
