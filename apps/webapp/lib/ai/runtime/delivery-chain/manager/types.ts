import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage } from '@langchain/core/messages'
import type { ZodType } from 'zod'

import type { ChatToolDefinition } from '@/lib/ai/tools'

import type {
    BoundaryReviewResultDraft,
    GeneralReviewResultDraft,
    PlanArtifactDraft,
    ReviewerRole,
    ReviewFindingDraft,
    RevisionTarget,
    RiskReviewResultDraft,
    RunStatus,
    TaskArtifactDraft,
} from './agent-contracts'
import type { SafeContractIssue } from './agent-contracts'
import type { StructuredOutputModel } from './contract-invocation'
import type {
    DeliveryWorkerToolResult,
    RuntimeArtifact,
    RuntimeArtifactKind,
    SubagentToolCallInput,
    SubagentToolId,
} from './subagent-tool-schemas'

export type {
    DeliveryWorkerToolResult,
    RuntimeArtifact,
    RuntimeArtifactKind,
    SubagentToolCallInput,
    SubagentToolId,
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

export interface DeliveryWorkerInvocation {
    businessModel: BaseChatModel
    contractModel: StructuredOutputModel
    messages: BaseMessage[]
    name: string
    normalizeError?: (error: unknown) => { code?: string }
    onBusinessInvoke?: () => void
    onContractInvoke?: (attempt: 'initial' | 'repair') => void
    schema: ZodType<unknown>
    validate?: (value: unknown) => SafeContractIssue[]
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

export type RuntimePlanArtifact = RuntimeArtifact & PlanArtifactDraft

export type RuntimeTaskArtifact = RuntimeArtifact &
    TaskArtifactDraft & {
        planRef: {
            artifactId: string
            revision: 1 | 2
        }
    }

export interface RuntimeReviewFinding extends ReviewFindingDraft {
    cycleId: string
    findingId: string
    sourceRole: ReviewerRole
}

export interface RevisionOutcome {
    requests: Array<{
        artifactRefs: Array<{ artifactId: string; revision: 2; target: RevisionTarget }>
        outcomeSummary: string
        requestKey: string
        sourceFindingIds: string[]
        updatedTargets: RevisionTarget[]
    }>
    revisionSequence: 1
}

export type RuntimeReviewResult =
    | (GeneralReviewResultDraft & { cycleId: string; findings: RuntimeReviewFinding[] })
    | (RiskReviewResultDraft & { cycleId: string; findings: RuntimeReviewFinding[] })
    | (BoundaryReviewResultDraft & { cycleId: string; findings: RuntimeReviewFinding[] })

export type ReviewExecutionState = 'completed' | 'contract_failure' | 'execution_failed' | 'timeout'

export interface StructuredReviewBundle {
    artifactRefs: {
        plan: { artifactId: string; revision: 1 | 2 }
        tasks: { artifactId: string; revision: 1 | 2 }
    }
    coverage: Record<ReviewerRole, ReviewExecutionState>
    cycleId: string
    findings: RuntimeReviewFinding[]
    results: Partial<Record<ReviewerRole, RuntimeReviewResult>>
}

export type { RunStatus }
