import type { AgentInterrupt, AgentRun } from '@ai-mind/database'

import {
    strategyReviewDecisionSchema,
    type TasklistAgentInterruptPayload,
    tasklistAgentInterruptPayloadSchema,
    tasklistRevisionReviewDecisionSchema,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/hitl-review-schema'
import {
    VERSION_PLAN_TASKLIST_AGENT_VERSION,
    VERSION_PLAN_TASKLIST_GRAPH_VERSION,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'

import { AgentRunServiceError } from './agent-run-error'
import { AgentRunRepository, type BeginAgentRunResumeFailure, type CreateAgentRunRecordInput } from './agent-run-repository'
import type { AgentInterruptPublicDto, AgentRunPublicDto, AgentRunResultStatus } from './contracts'
import { createAgentRunOwnerSessionHash, isAgentRunOwnerSessionHashEqual } from './ownership'

export type CreateAgentRunInput = Omit<CreateAgentRunRecordInput, 'agentVersion' | 'graphVersion' | 'ownerSessionHash'>

export interface BeginAgentRunResumeServiceInput {
    decision: unknown
    interruptId: string
    runId: string
    sessionId: string
}

export interface CreatePendingAgentInterruptServiceInput {
    langgraphInterruptId: string
    payload: TasklistAgentInterruptPayload
    runId: string
}

export interface AgentRunExecutionMetadata {
    modelId: string
    reasoningEnabled: boolean
    userGoalSummary: string
}

const resumeFailureErrorMap: Record<
    BeginAgentRunResumeFailure,
    { code: ConstructorParameters<typeof AgentRunServiceError>[0]; message: string }
> = {
    forbidden: {
        code: 'AGENT_RUN_FORBIDDEN',
        message: '当前 session 无权访问该 AgentRun。',
    },
    interrupt_not_pending: {
        code: 'AGENT_INTERRUPT_NOT_PENDING',
        message: '当前审核点已经被处理或不属于该 AgentRun。',
    },
    run_not_found: {
        code: 'AGENT_RUN_NOT_FOUND',
        message: 'AgentRun 不存在。',
    },
    run_not_paused: {
        code: 'AGENT_RUN_NOT_PAUSED',
        message: 'AgentRun 当前不处于 paused 状态。',
    },
    version_mismatch: {
        code: 'AGENT_RUN_VERSION_MISMATCH',
        message: '当前暂停的 AgentRun 来自旧版本，v0.3.0 暂不支持跨版本恢复，请重新发起 /tasklist。',
    },
}

function sanitizeAgentRunFailureMessage(message: string): string {
    return message
        .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi, 'postgresql://[REDACTED]@')
        .slice(0, 1000)
}

export class AgentRunService {
    constructor(
        private readonly repository = new AgentRunRepository(),
        private readonly env: Record<string, string | undefined> = process.env
    ) {}

    async createRun(sessionId: string, input: CreateAgentRunInput): Promise<AgentRunPublicDto> {
        const run = await this.repository.createRun({
            ...input,
            agentVersion: VERSION_PLAN_TASKLIST_AGENT_VERSION,
            graphVersion: VERSION_PLAN_TASKLIST_GRAPH_VERSION,
            ownerSessionHash: createAgentRunOwnerSessionHash(sessionId, this.env),
            userGoalSummary: input.userGoalSummary.trim().slice(0, 500),
        })

        return this.toPublicRunDto(run)
    }

    async getOwnedRun(sessionId: string, runId: string): Promise<AgentRunPublicDto> {
        const run = await this.repository.getRunById(runId)

        if (!run) {
            throw new AgentRunServiceError('AGENT_RUN_NOT_FOUND', 'AgentRun 不存在。')
        }

        const ownerSessionHash = createAgentRunOwnerSessionHash(sessionId, this.env)

        if (!isAgentRunOwnerSessionHashEqual(run.ownerSessionHash, ownerSessionHash)) {
            throw new AgentRunServiceError('AGENT_RUN_FORBIDDEN', '当前 session 无权访问该 AgentRun。')
        }

        const pendingInterrupt = await this.repository.getPendingInterrupt(runId)

        return this.toPublicRunDto(run, pendingInterrupt ? this.toPublicInterruptDto(pendingInterrupt) : undefined)
    }

    async getOwnedRunExecutionMetadata(sessionId: string, runId: string): Promise<AgentRunExecutionMetadata> {
        const run = await this.repository.getRunById(runId)

        if (!run) {
            throw new AgentRunServiceError('AGENT_RUN_NOT_FOUND', 'AgentRun 不存在。')
        }

        const ownerSessionHash = createAgentRunOwnerSessionHash(sessionId, this.env)

        if (!isAgentRunOwnerSessionHashEqual(run.ownerSessionHash, ownerSessionHash)) {
            throw new AgentRunServiceError('AGENT_RUN_FORBIDDEN', '当前 session 无权访问该 AgentRun。')
        }

        return {
            modelId: run.modelId,
            reasoningEnabled: run.reasoningEnabled,
            userGoalSummary: run.userGoalSummary,
        }
    }

    async createPendingInterrupt(input: CreatePendingAgentInterruptServiceInput): Promise<AgentInterruptPublicDto> {
        const parsedPayload = tasklistAgentInterruptPayloadSchema.parse(input.payload)

        if (parsedPayload.runId !== input.runId) {
            throw new AgentRunServiceError('AGENT_INTERRUPT_NOT_PENDING', 'interrupt payload 与 AgentRun 不匹配。')
        }

        try {
            const interrupt = await this.repository.createPendingInterrupt({
                allowedDecisions: Array.from(parsedPayload.allowedDecisions) as string[],
                interruptKind: parsedPayload.kind,
                langgraphInterruptId: input.langgraphInterruptId,
                nodeName: parsedPayload.nodeName,
                payload: parsedPayload,
                runId: input.runId,
                threadId: parsedPayload.threadId,
            })

            return this.toPublicInterruptDto(interrupt)
        } catch {
            throw new AgentRunServiceError('AGENT_RESUME_FAILED', 'AgentRun 当前状态不允许创建新的审核点。')
        }
    }

    async beginResume(input: BeginAgentRunResumeServiceInput) {
        const run = await this.repository.getRunById(input.runId)

        if (!run) {
            throw new AgentRunServiceError('AGENT_RUN_NOT_FOUND', 'AgentRun 不存在。')
        }

        const ownerSessionHash = createAgentRunOwnerSessionHash(input.sessionId, this.env)

        if (!isAgentRunOwnerSessionHashEqual(run.ownerSessionHash, ownerSessionHash)) {
            throw new AgentRunServiceError('AGENT_RUN_FORBIDDEN', '当前 session 无权访问该 AgentRun。')
        }

        if (run.agentVersion !== VERSION_PLAN_TASKLIST_AGENT_VERSION || run.graphVersion !== VERSION_PLAN_TASKLIST_GRAPH_VERSION) {
            const mismatchResult = await this.repository.markVersionMismatch(
                input.runId,
                VERSION_PLAN_TASKLIST_AGENT_VERSION,
                VERSION_PLAN_TASKLIST_GRAPH_VERSION
            )

            if (mismatchResult === 'run_not_paused') {
                throw new AgentRunServiceError('AGENT_RUN_NOT_PAUSED', 'AgentRun 当前不处于 paused 状态。')
            }

            if (mismatchResult === 'version_current') {
                throw new AgentRunServiceError('AGENT_RESUME_FAILED', 'AgentRun 版本状态在恢复期间发生变化。')
            }

            throw new AgentRunServiceError(
                'AGENT_RUN_VERSION_MISMATCH',
                '当前暂停的 AgentRun 来自旧版本，v0.3.0 暂不支持跨版本恢复，请重新发起 /tasklist。'
            )
        }

        if (run.status !== 'paused') {
            throw new AgentRunServiceError('AGENT_RUN_NOT_PAUSED', 'AgentRun 当前不处于 paused 状态。')
        }

        const interrupt = await this.repository.getInterruptById(input.interruptId)

        if (!interrupt || interrupt.runId !== input.runId || interrupt.status !== 'pending') {
            throw new AgentRunServiceError('AGENT_INTERRUPT_NOT_PENDING', '当前审核点已经被处理或不属于该 AgentRun。')
        }

        const decisionSchema =
            interrupt.interruptKind === 'strategy_review' ? strategyReviewDecisionSchema : tasklistRevisionReviewDecisionSchema
        const parsedDecision = decisionSchema.safeParse(input.decision)
        const allowedDecisions = Array.isArray(interrupt.allowedDecisionsJson) ? interrupt.allowedDecisionsJson : []

        if (
            !parsedDecision.success ||
            !allowedDecisions.every(item => typeof item === 'string') ||
            !allowedDecisions.includes(parsedDecision.data.type)
        ) {
            throw new AgentRunServiceError('INVALID_AGENT_REVIEW_DECISION', '审核决策不符合当前 interrupt 的受控 schema。')
        }

        const result = await this.repository.beginResume({
            agentVersion: VERSION_PLAN_TASKLIST_AGENT_VERSION,
            decision: parsedDecision.data,
            decisionType: parsedDecision.data.type,
            graphVersion: VERSION_PLAN_TASKLIST_GRAPH_VERSION,
            interruptId: input.interruptId,
            ownerSessionHash,
            runId: input.runId,
        })

        if (result.ok === false) {
            const error = resumeFailureErrorMap[result.reason]
            throw new AgentRunServiceError(error.code, error.message)
        }

        return {
            conversationId: run.conversationId,
            decision: parsedDecision.data,
            interrupt: this.toPublicInterruptDto(result.interrupt),
            run: this.toPublicRunDto(result.run),
            threadId: result.run.threadId,
        }
    }

    async markCompleted(runId: string, resultStatus: Exclude<AgentRunResultStatus, 'rejected'>) {
        const run = await this.repository.markCompleted(runId, resultStatus)

        if (!run) {
            throw new AgentRunServiceError('AGENT_RESUME_FAILED', 'AgentRun 当前状态不允许完成。')
        }

        return run
    }

    async markRejected(runId: string) {
        const run = await this.repository.markRejected(runId)

        if (!run) {
            throw new AgentRunServiceError('AGENT_RESUME_FAILED', 'AgentRun 当前状态不允许拒绝。')
        }

        return run
    }

    async markFailed(runId: string, failureCode: string, publicFailureMessage: string) {
        const run = await this.repository.markFailed(runId, failureCode.slice(0, 100), sanitizeAgentRunFailureMessage(publicFailureMessage))

        if (!run) {
            throw new AgentRunServiceError('AGENT_RESUME_FAILED', 'AgentRun 当前状态不允许标记失败。')
        }

        return run
    }

    private toPublicRunDto(run: AgentRun, pendingInterrupt?: AgentInterruptPublicDto): AgentRunPublicDto {
        return {
            agentType: run.agentType,
            agentVersion: run.agentVersion,
            assistantMessageId: run.assistantMessageId,
            graphVersion: run.graphVersion,
            pendingInterrupt,
            resultStatus: run.resultStatus ?? undefined,
            runId: run.id,
            status: run.status,
        }
    }

    private toPublicInterruptDto(interrupt: AgentInterrupt): AgentInterruptPublicDto {
        const parsedPayload = tasklistAgentInterruptPayloadSchema.safeParse(interrupt.payloadJson)

        if (!parsedPayload.success) {
            throw new AgentRunServiceError('AGENT_RESUME_FAILED', '持久化审核数据无法通过受控 schema 校验。')
        }

        return {
            allowedDecisions: Array.from(parsedPayload.data.allowedDecisions) as string[],
            interruptId: interrupt.id,
            interruptKind: interrupt.interruptKind,
            nodeName: interrupt.nodeName,
            payload: parsedPayload.data,
            runId: interrupt.runId,
            status: interrupt.status,
            threadId: interrupt.threadId,
        }
    }
}
