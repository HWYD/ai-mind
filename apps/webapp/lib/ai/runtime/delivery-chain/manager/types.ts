import type { ChatToolDefinition } from '@/lib/ai/tools'

import type {
    AgentContextBlock,
    RuntimeArtifact,
    RuntimeArtifactKind,
    SubagentToolCallInput,
    SubagentToolId,
    SubagentToolInput,
    SubagentToolJsonResult,
} from './subagent-tool-schemas'

export type {
    AgentContextBlock,
    RuntimeArtifact,
    RuntimeArtifactKind,
    SubagentToolCallInput,
    SubagentToolId,
    SubagentToolInput,
    SubagentToolJsonResult,
} from './subagent-tool-schemas'

export interface SubagentToolDefinition {
    allowedContextKinds: string[]
    allowedTools: string[]
    description: string
    displayName: string
    id: SubagentToolId
    inputArtifactKinds: RuntimeArtifactKind[]
    nonGoals: string[]
    outputArtifactKinds: RuntimeArtifactKind[]
    roleInstruction: string
}

export interface SubagentToolInvocation extends SubagentToolInput {
    invocationId: string
    startedAt: string
    subagentId: SubagentToolId
}

export interface SubagentToolResult {
    artifacts: RuntimeArtifact[]
    endedAt: string
    invocationId: string
    markdown: string
    status: SubagentToolJsonResult['status']
    subagentId: SubagentToolId
    summaryForManager: string
    warnings: string[]
}

export interface SubagentToolInvocationTraceEntry {
    endedAt?: string
    invocationId: string
    startedAt: string
    status: 'blocked' | 'completed' | 'failed' | 'running'
    subagentId: SubagentToolId
    summary: string
}

export interface SubagentToolInvocationTrace {
    invocations: SubagentToolInvocationTraceEntry[]
    workflowId: string
}

export interface DelegationPolicy {
    allowedSubagentTools: SubagentToolId[]
    allowNestedDelegation: boolean
    allowParallel: boolean
    maxToolCalls: number
    rejectOutOfOrderToolCalls: boolean
    rejectUnregisteredTools: boolean
    requirePlanBeforeTask: boolean
    requireTasksBeforeReview: boolean
}

export interface DeliveryChainSubagentToolDefinition extends SubagentToolDefinition {
    chatToolDefinition: ChatToolDefinition<SubagentToolCallInput>
}
