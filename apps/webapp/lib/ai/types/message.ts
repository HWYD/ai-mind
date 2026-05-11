import type { ChatComposerDisplaySegment, ChatComposerPayload } from './chat'

export type MindRole = 'system' | 'user' | 'assistant'
export type CapabilitySource = 'internal' | 'mcp'
export type CapabilityLocation = 'local' | 'remote'

export interface BasePart {
    id?: string
    type: string
}

export interface TextPart extends BasePart {
    type: 'text'
    text: string
    format: 'markdown'
    displaySegments?: ChatComposerDisplaySegment[]
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
    source?: CapabilitySource
    location?: CapabilityLocation
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
    source?: CapabilitySource
    location?: CapabilityLocation
    serverId: string
    status: 'loading' | 'completed' | 'failed'
    contentPreview?: string
    isTruncated?: boolean
    previewChars?: number
    error?: string
}

export interface SkillPart extends BasePart {
    type: 'skill'
    skillId: string
    name: string
    description?: string
}

export interface PromptPart extends BasePart {
    type: 'prompt'
    promptName: string
    source?: CapabilitySource
    location?: CapabilityLocation
    serverId?: string
    status: 'called' | 'completed' | 'failed'
    input?: string
    messageCount?: number
    error?: string
}

export type MindMessagePart = TextPart | ReasoningPart | ToolPart | ResourcePart | SkillPart | PromptPart

export interface MindMessage {
    id: string
    role: MindRole
    parts: MindMessagePart[]
    createdAt: string
    composer?: ChatComposerPayload
}
