import type { AgentArtifactFormat, AgentArtifactKind, AgentGraphDebugSummary } from '@ai-mind/stream-core/protocol'

import type { TasklistAgentInterruptPayload } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/hitl-review-schema'

import type { ChatComposerDisplaySegment, ChatComposerPayload } from './chat'

export type MindRole = 'system' | 'user' | 'assistant'
export type MindMessageStatus = 'completed' | 'failed' | 'paused' | 'resuming' | 'streaming'
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

export type AgentStepStatus = 'completed' | 'failed' | 'paused' | 'running' | 'skipped'
export type AgentStepSeverity = 'error' | 'info' | 'warning'

export interface AgentGraphNodeEntry {
    durationMs?: number
    error?: string
    nodeId: string
    partId: string
    patchSummaries: string[]
    severity?: AgentStepSeverity
    status: AgentStepStatus
    stepIndex: number
    summary?: string
    tags?: string[]
    title: string
}

export interface AgentGraphRouteEntry {
    fromNodeId: string
    reason?: string
    routeLabel: string
    toNodeId: string
}

export interface AgentGraphTrace {
    debugSummary?: AgentGraphDebugSummary
    nodes: AgentGraphNodeEntry[]
    routes: AgentGraphRouteEntry[]
    runtime: 'LangGraph'
}

export interface AgentStepPart extends BasePart {
    type: 'agent-step'
    agentName: string
    graph: AgentGraphTrace
    runId: string
    status: AgentStepStatus
}

export type AgentInterruptPartStatus = 'decided' | 'failed' | 'pending' | 'rejected' | 'submitting'

export interface AgentInterruptPart extends BasePart {
    type: 'agent-interrupt'
    interruptId: string
    interruptKind: 'strategy_review' | 'tasklist_revision_review'
    payload: TasklistAgentInterruptPayload
    runId: string
    status: AgentInterruptPartStatus
    threadId: string
}

export interface AgentTextArtifactViewModel {
    artifactId: string
    artifactKind: AgentArtifactKind
    artifactType: 'text'
    content: string
    error?: string
    format: AgentArtifactFormat
    metadata?: {
        charCount?: number
        generatedFrom?: string
        revision?: number
        sectionCount?: number
        targetVersion?: string
        validated?: boolean
    }
    status: 'completed' | 'failed' | 'streaming'
    title: string
}

export type MindMessagePart =
    | TextPart
    | ReasoningPart
    | ToolPart
    | ResourcePart
    | SkillPart
    | PromptPart
    | AgentStepPart
    | AgentInterruptPart

export interface MindMessage {
    id: string
    role: MindRole
    parts: MindMessagePart[]
    artifacts?: AgentTextArtifactViewModel[]
    createdAt: string
    composer?: ChatComposerPayload
    status?: MindMessageStatus
}
