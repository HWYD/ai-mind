export type MindRole = 'system' | 'user' | 'assistant'

export interface BasePart {
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

export type MindMessagePart = TextPart | ReasoningPart

export interface MindMessage {
    id: string
    role: MindRole
    parts: MindMessagePart[]
    createdAt: string
}
