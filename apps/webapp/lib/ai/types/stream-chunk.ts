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
    input: string
}

export interface ToolEndChunk {
    type: 'tool-end'
    partId: string
    toolName: string
    input: string
    output: string
}

export interface ToolErrorChunk {
    type: 'tool-error'
    partId: string
    toolName: string
    input: string
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
    | FinishChunk
    | ErrorChunk
