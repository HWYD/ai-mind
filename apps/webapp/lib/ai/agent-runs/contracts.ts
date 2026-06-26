import { z } from 'zod'

export const agentRunStatuses = [
    'running',
    'paused',
    'resuming',
    'completed',
    'rejected',
    'failed',
    'cancelled',
    'version_mismatch',
] as const

export const agentRunResultStatuses = ['final', 'final_with_manual_review_items', 'blocked', 'rejected'] as const
export const agentInterruptStatuses = ['pending', 'decided', 'rejected', 'invalidated'] as const
export const agentInterruptKinds = ['strategy_review', 'tasklist_revision_review'] as const

export const agentRunStatusSchema = z.enum(agentRunStatuses)
export const agentRunResultStatusSchema = z.enum(agentRunResultStatuses)
export const agentInterruptStatusSchema = z.enum(agentInterruptStatuses)
export const agentInterruptKindSchema = z.enum(agentInterruptKinds)

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>
export type AgentRunResultStatus = z.infer<typeof agentRunResultStatusSchema>
export type AgentInterruptStatus = z.infer<typeof agentInterruptStatusSchema>
export type AgentInterruptKind = z.infer<typeof agentInterruptKindSchema>

export interface AgentInterruptPublicDto<TPayload = unknown, TDecisionType extends string = string> {
    allowedDecisions: TDecisionType[]
    interruptKind: AgentInterruptKind
    interruptId: string
    nodeName: string
    payload: TPayload
    runId: string
    status: AgentInterruptStatus
    threadId: string
}

export interface AgentRunPublicDto<TInterrupt = AgentInterruptPublicDto> {
    agentType: string
    agentVersion: string
    assistantMessageId: string
    graphVersion: string
    pendingInterrupt?: TInterrupt
    resultStatus?: AgentRunResultStatus
    runId: string
    status: AgentRunStatus
}

export const agentRunApiErrorCodes = [
    'INVALID_AGENT_REVIEW_DECISION',
    'AGENT_RUN_FORBIDDEN',
    'AGENT_RUN_NOT_FOUND',
    'AGENT_RUN_NOT_PAUSED',
    'AGENT_INTERRUPT_NOT_PENDING',
    'AGENT_RUN_VERSION_MISMATCH',
    'AGENT_RESUME_FAILED',
] as const

export const agentRunApiErrorCodeSchema = z.enum(agentRunApiErrorCodes)
export type AgentRunApiErrorCode = z.infer<typeof agentRunApiErrorCodeSchema>
