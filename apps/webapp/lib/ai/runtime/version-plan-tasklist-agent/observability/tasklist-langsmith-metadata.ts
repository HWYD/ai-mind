import type { AgentInterruptKind, AgentRunResultStatus, AgentRunStatus } from '@/lib/ai/agent-runs/contracts'

import { type AgentReviewDecisionType, agentReviewDecisionTypes, type TasklistAgentInterruptPayload } from '../contract/hitl-review-schema'
import type { TasklistLangSmithEnvironment } from './langsmith-config'

export type TasklistLangSmithMetadataValue = boolean | number | string
export type TasklistLangSmithMetadata = Record<string, TasklistLangSmithMetadataValue>

export type TasklistLangSmithResultTag = 'blocked' | 'completed' | 'failed' | 'final' | 'final-with-manual-review-items' | 'rejected'

export type TasklistLangSmithTag =
    | 'ai-mind'
    | 'development'
    | 'demo'
    | 'hitl'
    | 'initial'
    | 'production'
    | 'resume'
    | 'tasklist-agent'
    | 'test'
    | 'unknown'
    | TasklistLangSmithResultTag

export interface BuildTasklistLangSmithRunMetadataInput {
    agentType: string
    agentVersion: string
    assistantMessageId: string
    environment: TasklistLangSmithEnvironment | 'demo'
    graphVersion: string
    modelId: string
    provider?: string
    reasoningEnabled: boolean
    runId: string
    threadId: string
    versionPlanUri: string
}

export interface BuildTasklistLangSmithHitlMetadataInput {
    blockingIssueCount?: number
    decisionType?: AgentReviewDecisionType
    draftRevision?: number
    fixNowCount?: number
    interruptId?: string
    interruptKind?: AgentInterruptKind
    reviewRound?: number
    strategyRegenerations?: number
    weakSectionCount?: number
}

export interface BuildTasklistLangSmithResultMetadataInput {
    artifactGenerated: boolean
    durationMs: number
    failureCode?: string
    resultStatus?: AgentRunResultStatus
    runStatus: AgentRunStatus
    sanitizedFailureMessage?: string
}

function withoutUndefined(metadata: Record<string, TasklistLangSmithMetadataValue | undefined>): TasklistLangSmithMetadata {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined)) as TasklistLangSmithMetadata
}

export function buildTasklistLangSmithRunMetadata(input: BuildTasklistLangSmithRunMetadataInput): TasklistLangSmithMetadata {
    return withoutUndefined({
        agentType: input.agentType,
        agentVersion: input.agentVersion,
        app: 'ai-mind',
        assistantMessageId: input.assistantMessageId,
        environment: input.environment,
        graphVersion: input.graphVersion,
        modelId: input.modelId,
        provider: input.provider,
        reasoningEnabled: input.reasoningEnabled,
        runId: input.runId,
        threadId: input.threadId,
        versionPlanUri: input.versionPlanUri,
    })
}

export function buildTasklistLangSmithHitlMetadata(input: BuildTasklistLangSmithHitlMetadataInput): TasklistLangSmithMetadata {
    return withoutUndefined({
        blockingIssueCount: input.blockingIssueCount,
        decisionType: input.decisionType,
        draftRevision: input.draftRevision,
        fixNowCount: input.fixNowCount,
        interruptId: input.interruptId,
        interruptKind: input.interruptKind,
        reviewRound: input.reviewRound,
        strategyRegenerations: input.strategyRegenerations,
        weakSectionCount: input.weakSectionCount,
    })
}

export function buildTasklistLangSmithHitlMetadataFromInterruptPayload(input: {
    interruptId: string
    payload: TasklistAgentInterruptPayload
}): TasklistLangSmithMetadata {
    if (input.payload.kind === 'strategy_review') {
        return buildTasklistLangSmithHitlMetadata({
            interruptId: input.interruptId,
            interruptKind: input.payload.kind,
            reviewRound: input.payload.data.reviewRound,
            strategyRegenerations: input.payload.data.reviewRound - 1,
        })
    }

    return buildTasklistLangSmithHitlMetadata({
        blockingIssueCount: input.payload.data.validation.blockingIssues.length,
        draftRevision: input.payload.data.revision,
        fixNowCount: input.payload.data.fixNow.length,
        interruptId: input.interruptId,
        interruptKind: input.payload.kind,
        reviewRound: input.payload.data.reviewRound,
        weakSectionCount: input.payload.data.validation.weakSections.length,
    })
}

export function extractTasklistLangSmithDecisionType(decision: unknown): AgentReviewDecisionType | undefined {
    if (!decision || typeof decision !== 'object' || !('type' in decision)) {
        return undefined
    }

    const decisionType = decision.type

    return typeof decisionType === 'string' && agentReviewDecisionTypes.includes(decisionType as AgentReviewDecisionType)
        ? (decisionType as AgentReviewDecisionType)
        : undefined
}

export function sanitizeTasklistLangSmithFailureMessage(message: unknown): string | undefined {
    if (typeof message !== 'string') {
        return undefined
    }

    const normalized = message.replace(/\s+/g, ' ').trim()

    if (!normalized) {
        return undefined
    }

    const redacted = normalized
        .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"',\s]+/gi, '$1=[redacted]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')

    return redacted.slice(0, 500)
}

export function buildTasklistLangSmithResultMetadata(input: BuildTasklistLangSmithResultMetadataInput): TasklistLangSmithMetadata {
    return withoutUndefined({
        artifactGenerated: input.artifactGenerated,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        failureCode: input.failureCode,
        resultStatus: input.resultStatus,
        runStatus: input.runStatus,
        sanitizedFailureMessage: sanitizeTasklistLangSmithFailureMessage(input.sanitizedFailureMessage),
    })
}

export function buildTasklistLangSmithTags(input: {
    environment: TasklistLangSmithEnvironment | 'demo'
    resultStatus?: AgentRunResultStatus
    runStatus?: AgentRunStatus
    stage: 'initial' | 'resume'
}): TasklistLangSmithTag[] {
    const tags: TasklistLangSmithTag[] = ['ai-mind', 'tasklist-agent', 'hitl', input.stage, input.environment]

    if (input.runStatus === 'failed') {
        tags.push('failed')
    } else if (input.runStatus === 'rejected' || input.resultStatus === 'rejected') {
        tags.push('rejected')
    } else if (input.resultStatus === 'blocked') {
        tags.push('blocked')
    } else if (input.resultStatus === 'final_with_manual_review_items') {
        tags.push('final-with-manual-review-items')
    } else if (input.resultStatus === 'final') {
        tags.push('final')
    } else if (input.runStatus === 'completed') {
        tags.push('completed')
    }

    return tags
}
