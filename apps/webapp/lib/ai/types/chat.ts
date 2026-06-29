import type { MindRole, ReasoningPart, TextPart } from './message'

export type ChatComposerCommandName = 'check' | 'delivery-chain' | 'summary' | 'tasklist'

export interface ChatComposerCommand {
    label: string
    name: ChatComposerCommandName
}

export interface ChatComposerReference {
    id: string
    label: string
    serverId?: string
    source: 'local' | 'remote'
    type: 'resource'
    uri: string
}

export interface ChatComposerPayload {
    command?: ChatComposerCommand
    plainText: string
    references?: ChatComposerReference[]
}

export type ChatComposerDisplaySegment =
    | { text: string; type: 'text' }
    | { command: ChatComposerCommand; type: 'command' }
    | { reference: ChatComposerReference; type: 'resource' }

export interface MindMessageInput {
    role: MindRole
    parts: Array<TextPart | ReasoningPart>
}

export interface ChatRequestOptions {
    skill?: string
    modelId?: string
    temperature?: number
    maxTokens?: number
    enableReasoning?: boolean
}

export interface ChatRequest {
    conversationId: string
    composer?: ChatComposerPayload
    messages: MindMessageInput[]
    options?: ChatRequestOptions
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type ChatSkillMode = 'auto' | 'utility' | 'reader'
