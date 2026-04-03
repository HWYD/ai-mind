import type { MindRole, ReasoningPart, TextPart } from './message'

export interface MindMessageInput {
    role: MindRole
    parts: Array<TextPart | ReasoningPart>
}

export interface ChatRequestOptions {
    skill?: string
    model?: string
    temperature?: number
    maxTokens?: number
    enableReasoning?: boolean
}

export interface ChatRequest {
    conversationId: string
    messages: MindMessageInput[]
    options?: ChatRequestOptions
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type ChatSkillMode = 'auto' | 'utility' | 'reader'
