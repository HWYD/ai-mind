export type MindRole = 'system' | 'user' | 'assistant'

export interface BasePart {
    id?: string
    type: string
}

export interface TextPart extends BasePart {
    type: 'text'
    text: string
    format: 'markdown'
}

export interface ReasoningPart extends BasePart {
    type: 'reasoning'
    text: string
    format: 'markdown'
    visibility?: 'collapsed' | 'expanded' | 'hidden'
}

export interface ToolPart extends BasePart {
    type: 'tool'
    toolName: string
    title?: string
    action?: string
    source?: 'internal' | 'mcp'
    serverId?: string
    status: 'called' | 'completed' | 'failed'
    input: string
    output?: string
    error?: string
}

export interface ResourcePart extends BasePart {
    type: 'resource'
    resourceName: string
    uri: string
    serverId: string
    status: 'loading' | 'completed' | 'failed'
    contentPreview?: string
    isTruncated?: boolean
    previewChars?: number
    error?: string
}

export type MindMessagePart = TextPart | ReasoningPart | ToolPart | ResourcePart

export interface MindMessage {
    id: string
    role: MindRole
    parts: MindMessagePart[]
    createdAt: string
}
