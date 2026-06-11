export interface StartChunk {
    type: 'start'
    messageId: string
}

export interface SkillSelectedChunk {
    type: 'skill-selected'
    skillId: string
    name: string
    description?: string
}

export type AgentStepStatus = 'completed' | 'failed' | 'running' | 'skipped'
export type AgentStepSeverity = 'error' | 'info' | 'warning'

export interface AgentStepStartChunk {
    type: 'agent-step-start'
    partId: string
    runId: string
    agentName: string
    stepIndex: number
    actionType: string
    title: string
}

export interface AgentStepEndChunk {
    type: 'agent-step-end'
    partId: string
    runId: string
    agentName: string
    stepIndex: number
    actionType: string
    status: Exclude<AgentStepStatus, 'running'>
    title?: string
    summary?: string
    durationMs?: number
    severity?: AgentStepSeverity
    tags?: string[]
    error?: string
}

export interface AgentGraphNodeStartChunk {
    type: 'agent-graph-node-start'
    partId: string
    runId: string
    threadId: string
    agentName: string
    nodeId: string
    title: string
    stepIndex: number
}

export interface AgentGraphNodeEndChunk {
    type: 'agent-graph-node-end'
    partId: string
    runId: string
    threadId: string
    agentName: string
    nodeId: string
    status: Exclude<AgentStepStatus, 'running'>
    summary?: string
    durationMs?: number
    severity?: AgentStepSeverity
    tags?: string[]
    error?: string
}

export interface AgentGraphRouteChunk {
    type: 'agent-graph-route'
    partId: string
    runId: string
    threadId: string
    agentName: string
    fromNodeId: string
    toNodeId: string
    routeLabel: string
    reason?: string
}

export interface AgentGraphStatePatchChunk {
    type: 'agent-graph-state-patch'
    partId: string
    runId: string
    threadId: string
    agentName: string
    nodeId: string
    patchSummary: string
}

export interface AgentGraphDebugRouteSummary {
    fromNodeId: string
    label: string
    toNodeId: string
}

export interface AgentGraphDebugSummary {
    checkpointMode: 'memory' | 'off'
    currentNode?: string
    decision?: {
        type: string
    }
    draftRevisions: number
    lastRoute?: AgentGraphDebugRouteSummary
    manualReviewItemCount: number
    maxDraftRevisions: number
    maxOptionalContextReads: number
    maxSteps: number
    optionalContext?: {
        status: string
    }
    optionalContextReads: number
    readiness?: {
        status: string
    }
    revisionEffect?: {
        finalDecision: string
    }
    runId: string
    runtimeMode: 'graph'
    stepCount: number
    strategy?: {
        expectedStepRange: [number, number]
        granularity: string
    }
    threadId: string
    validationV1?: {
        score: number
        status: string
    }
    validationV2?: {
        score: number
        status: string
    }
    visitedNodes: string[]
    warningDisposition?: {
        fixNowCount: number
        manualReviewItemCount: number
    }
}

export interface AgentGraphDebugSummaryChunk {
    type: 'agent-graph-debug-summary'
    partId: string
    runId: string
    threadId: string
    agentName: string
    summary: AgentGraphDebugSummary
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

export const agentArtifactKinds = ['tasklist', 'plan', 'copywriting', 'audit_report', 'release_note', 'generic_markdown'] as const
export type AgentArtifactKind = (typeof agentArtifactKinds)[number]

export const agentArtifactFormats = ['markdown', 'plain_text'] as const
export type AgentArtifactFormat = (typeof agentArtifactFormats)[number]

export interface AgentTextArtifactMetadata {
    charCount?: number
    generatedFrom?: string
    revision?: number
    sectionCount?: number
    targetVersion?: string
    validated?: boolean
}

export interface AgentArtifactStartChunk {
    type: 'artifact-start'
    artifactId: string
    artifactKind: AgentArtifactKind
    artifactType: 'text'
    format: AgentArtifactFormat
    metadata?: AgentTextArtifactMetadata
    sourceStepId?: string
    title: string
}

export interface AgentArtifactDeltaChunk {
    type: 'artifact-delta'
    artifactId: string
    delta: string
}

export interface AgentArtifactEndChunk {
    type: 'artifact-end'
    artifactId: string
    error?: string
    metadata?: AgentTextArtifactMetadata
    status: 'completed' | 'failed'
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
    location?: 'local' | 'remote'
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
    location?: 'local' | 'remote'
    serverId?: string
    input: string
    output: string
}

export interface PromptStartChunk {
    type: 'prompt-start'
    partId: string
    promptName: string
    source?: 'internal' | 'mcp'
    location?: 'local' | 'remote'
    serverId?: string
    input?: string
}

export interface PromptEndChunk {
    type: 'prompt-end'
    partId: string
    promptName: string
    source?: 'internal' | 'mcp'
    location?: 'local' | 'remote'
    serverId?: string
    status: 'completed' | 'failed'
    messageCount?: number
}

export interface ResourceStartChunk {
    type: 'resource-start'
    partId: string
    resourceName: string
    uri: string
    source?: 'internal' | 'mcp'
    location?: 'local' | 'remote'
    serverId: string
}

export interface ResourceEndChunk {
    type: 'resource-end'
    partId: string
    resourceName: string
    uri: string
    source?: 'internal' | 'mcp'
    location?: 'local' | 'remote'
    serverId: string
    contentPreview?: string
    isTruncated?: boolean
    previewChars?: number
}

export const streamErrorScopes = ['tool', 'resource', 'prompt', 'runtime', 'request'] as const
export type StreamErrorScope = (typeof streamErrorScopes)[number]

export const streamErrorStages = ['planning', 'tool-execution', 'final-answer', 'runtime'] as const
export type StreamErrorStage = (typeof streamErrorStages)[number]

export const streamErrorCodes = [
    'REQUEST_ABORTED',
    'INVALID_SKILL',
    'MODEL_STREAM_FAILED',
    'TOOL_VALIDATION_FAILED',
    'TOOL_EXECUTION_FAILED',
    'PROMPT_FETCH_FAILED',
    'PROMPT_INJECTION_FAILED',
    'MCP_UNAUTHORIZED',
    'MCP_FORBIDDEN',
    'MCP_NOT_FOUND',
    'MCP_TIMEOUT',
    'MCP_EXECUTION_FAILED',
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
    location?: 'local' | 'remote'
    serverId?: string
    input?: string
    promptName?: string
}

export type ChatStreamChunk =
    | StartChunk
    | SkillSelectedChunk
    | AgentStepStartChunk
    | AgentStepEndChunk
    | AgentGraphNodeStartChunk
    | AgentGraphNodeEndChunk
    | AgentGraphRouteChunk
    | AgentGraphStatePatchChunk
    | AgentGraphDebugSummaryChunk
    | TextStartChunk
    | TextDeltaChunk
    | TextEndChunk
    | AgentArtifactStartChunk
    | AgentArtifactDeltaChunk
    | AgentArtifactEndChunk
    | ReasoningStartChunk
    | ReasoningDeltaChunk
    | ReasoningEndChunk
    | ToolStartChunk
    | ToolEndChunk
    | PromptStartChunk
    | PromptEndChunk
    | ResourceStartChunk
    | ResourceEndChunk
    | FinishChunk
    | ErrorChunk
