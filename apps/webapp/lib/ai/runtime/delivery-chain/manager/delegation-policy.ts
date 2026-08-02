import type { ReviewerRole } from './agent-contracts'
import { findRuntimeArtifact, hasRuntimeArtifact } from './runtime-artifacts'
import type { DelegationPolicy, RuntimeArtifact, SubagentToolId } from './types'

// v0.4.1: Review Group 并行策略，只在 Review phase 内部生效，不修改全局 allowParallel。
export interface ReviewGroupPolicy {
    allowedReviewTools: SubagentToolId[]
    allowParallelInReview: boolean
    maxReviewToolCalls: number
}

export const deliveryChainReviewGroupPolicy: ReviewGroupPolicy = {
    allowedReviewTools: ['review-subagent', 'risk-subagent', 'boundary-subagent'],
    allowParallelInReview: true,
    maxReviewToolCalls: 3,
}

export const deliveryChainDelegationPolicy: DelegationPolicy = {
    allowedSubagentTools: ['plan-subagent', 'task-subagent', 'review-subagent', 'risk-subagent', 'boundary-subagent'],
    allowNestedDelegation: false,
    allowParallel: false,
    maxToolCalls: 5,
    rejectOutOfOrderToolCalls: true,
    rejectUnregisteredTools: true,
    requirePlanBeforeTask: true,
    requireTasksBeforeReview: true,
}

/** v0.4.11 的阶段预算；它限制受控流程，而非给模型开放动态调度。 */
export const deliveryChainExecutionBudgets = {
    contractRepairAttemptsPerStage: 1,
    plan: 1,
    postReviewDecision: 1,
    preDecision: 1,
    planRevision: 1,
    reviewCycles: 1,
    reviewerStartsPerCycle: 3,
    revisionCycles: 1,
    taskRevision: 1,
    tasks: 1,
} as const

export type DeliveryChainExecutionBudgetStage = keyof typeof deliveryChainExecutionBudgets

export interface DeliveryChainExecutionBudget {
    claim: (stage: DeliveryChainExecutionBudgetStage) => boolean
    remaining: () => Readonly<Record<DeliveryChainExecutionBudgetStage, number>>
}

export function createDeliveryChainExecutionBudget(): DeliveryChainExecutionBudget {
    const remaining: Record<DeliveryChainExecutionBudgetStage, number> = {
        contractRepairAttemptsPerStage: deliveryChainExecutionBudgets.contractRepairAttemptsPerStage,
        plan: deliveryChainExecutionBudgets.plan,
        postReviewDecision: deliveryChainExecutionBudgets.postReviewDecision,
        preDecision: deliveryChainExecutionBudgets.preDecision,
        planRevision: deliveryChainExecutionBudgets.planRevision,
        reviewCycles: deliveryChainExecutionBudgets.reviewCycles,
        reviewerStartsPerCycle: deliveryChainExecutionBudgets.reviewerStartsPerCycle,
        revisionCycles: deliveryChainExecutionBudgets.revisionCycles,
        taskRevision: deliveryChainExecutionBudgets.taskRevision,
        tasks: deliveryChainExecutionBudgets.tasks,
    }

    return {
        claim(stage) {
            if (remaining[stage] < 1) return false
            remaining[stage] -= 1
            return true
        },
        remaining() {
            return { ...remaining }
        },
    }
}

export interface DelegationValidationFailure {
    message: string
    summary: string
}

const REQUIRED_REVIEWER_ROLES: ReviewerRole[] = ['general', 'risk', 'boundary']

/**
 * Runtime 不会替 Supervisor 排序、去重或补齐角色；只接受恰好一次的固定集合。
 */
export function validateExactReviewerRoles(reviewerRoles: ReviewerRole[]): DelegationValidationFailure | null {
    if (reviewerRoles.length !== REQUIRED_REVIEWER_ROLES.length) {
        return {
            message: 'Supervisor reviewerRoles 必须恰好声明 general、risk、boundary 各一次。',
            summary: 'Supervisor 声明的 Reviewer 集合不完整。',
        }
    }

    const counts = new Map<ReviewerRole, number>()
    for (const role of reviewerRoles) {
        counts.set(role, (counts.get(role) ?? 0) + 1)
    }

    if (REQUIRED_REVIEWER_ROLES.some(role => counts.get(role) !== 1)) {
        return {
            message: 'Supervisor reviewerRoles 必须恰好声明 general、risk、boundary 各一次。',
            summary: 'Supervisor 声明的 Reviewer 集合不完整或重复。',
        }
    }

    return null
}

// v0.4.1: phase 上下文，用于区分串行阶段和并行 Review 阶段。
export type DeliveryPhase = 'plan' | 'task' | 'review-group'

export function validateToolCallBatch(toolCallCount: number, allowParallel: boolean): DelegationValidationFailure | null {
    if (toolCallCount === 1) {
        return null
    }

    if (toolCallCount === 0) {
        return {
            message: 'ControlledDeliveryManager 未收到合法 tool call。',
            summary: 'Manager 未发起合法子 Agent tool 调用',
        }
    }

    if (!allowParallel) {
        return {
            message: 'ControlledDeliveryManager 不允许一次返回多个 tool calls。',
            summary: 'Manager 发起了并行 tool 调用，已被拒绝',
        }
    }

    return null
}

// v0.4.1: phase-aware batch 校验。Review phase 允许 count > 1（上限 maxReviewToolCalls），其余 phase 保持 count === 1。
export function validateToolCallBatchForPhase(
    toolCallCount: number,
    phase: DeliveryPhase,
    reviewGroupPolicy: ReviewGroupPolicy,
    basePolicy: DelegationPolicy
): DelegationValidationFailure | null {
    if (toolCallCount === 0) {
        return {
            message: 'ControlledDeliveryManager 未收到合法 tool call。',
            summary: 'Manager 未发起合法子 Agent tool 调用',
        }
    }

    if (phase === 'review-group') {
        if (!reviewGroupPolicy.allowParallelInReview && toolCallCount > 1) {
            return {
                message: 'ControlledDeliveryManager Review phase 不允许并行 tool 调用。',
                summary: 'Manager 在 Review phase 发起了并行 tool 调用，已被拒绝',
            }
        }

        if (toolCallCount > reviewGroupPolicy.maxReviewToolCalls) {
            return {
                message: `ControlledDeliveryManager Review phase 超过最大并行 tool 数量 ${reviewGroupPolicy.maxReviewToolCalls}。`,
                summary: 'Manager 在 Review phase 超过最大并行 tool 数量，已被拒绝',
            }
        }

        return null
    }

    // Plan/Task phase 保持串行
    return validateToolCallBatch(toolCallCount, basePolicy.allowParallel)
}

export function validateDelegationToolCall(options: {
    artifacts: RuntimeArtifact[]
    expectedToolId: SubagentToolId
    policy: DelegationPolicy
    requestedToolId: string
    toolCallsSoFar: number
}): DelegationValidationFailure | null {
    const { artifacts, expectedToolId, policy, requestedToolId, toolCallsSoFar } = options

    if (policy.rejectUnregisteredTools && !policy.allowedSubagentTools.includes(requestedToolId as SubagentToolId)) {
        return {
            message: `ControlledDeliveryManager 收到未注册的 tool call：${requestedToolId}。`,
            summary: 'Manager 调用了未注册的子 Agent tool',
        }
    }

    if (toolCallsSoFar >= policy.maxToolCalls) {
        return {
            message: `ControlledDeliveryManager 超过最大委派次数 ${policy.maxToolCalls}。`,
            summary: 'Manager 超过最大委派次数，已安全失败',
        }
    }

    if (policy.rejectOutOfOrderToolCalls && requestedToolId !== expectedToolId) {
        return {
            message: `ControlledDeliveryManager 期望调用 ${expectedToolId}，实际收到 ${requestedToolId}。`,
            summary: 'Manager 发起了乱序 tool 调用，已被拒绝',
        }
    }

    if (requestedToolId === 'task-subagent' && policy.requirePlanBeforeTask && !hasRuntimeArtifact(artifacts, 'plan')) {
        return {
            message: 'task-subagent 缺少 plan artifact，不得 completed。',
            summary: 'task-subagent 缺少 plan artifact，已被拒绝',
        }
    }

    if (
        requestedToolId === 'review-subagent' &&
        policy.requireTasksBeforeReview &&
        (findRuntimeArtifact(artifacts, 'plan') === undefined || findRuntimeArtifact(artifacts, 'tasks') === undefined)
    ) {
        return {
            message: 'review-subagent 缺少 plan 或 tasks artifact，不得 completed。',
            summary: 'review-subagent 缺少必要 artifact，已被拒绝',
        }
    }

    return null
}

// v0.4.1: Review Group 单个 tool call 校验。
// Review phase 允许 review-class tool，拒绝 plan/task tool、未注册 tool、nested delegation。
export function validateReviewGroupToolCall(options: {
    artifacts: RuntimeArtifact[]
    policy: DelegationPolicy
    reviewGroupPolicy: ReviewGroupPolicy
    requestedToolId: string
    toolCallsSoFar: number
}): DelegationValidationFailure | null {
    const { artifacts, policy, reviewGroupPolicy, requestedToolId, toolCallsSoFar } = options

    // 拒绝未注册 tool
    if (policy.rejectUnregisteredTools && !policy.allowedSubagentTools.includes(requestedToolId as SubagentToolId)) {
        return {
            message: `ControlledDeliveryManager Review Group 收到未注册的 tool call：${requestedToolId}。`,
            summary: 'Manager 在 Review Group 调用了未注册的子 Agent tool',
        }
    }

    // 拒绝超出最大委派次数
    if (toolCallsSoFar >= policy.maxToolCalls) {
        return {
            message: `ControlledDeliveryManager 超过最大委派次数 ${policy.maxToolCalls}。`,
            summary: 'Manager 超过最大委派次数，已安全失败',
        }
    }

    // 拒绝 plan/task tool（Review phase 只允许 review-class tool）
    if (!reviewGroupPolicy.allowedReviewTools.includes(requestedToolId as SubagentToolId)) {
        return {
            message: `ControlledDeliveryManager Review Group 拒绝非 review-class tool：${requestedToolId}。`,
            summary: 'Manager 在 Review Group 调用了非 review-class tool，已被拒绝',
        }
    }

    // 拒绝 nested delegation
    if (policy.allowNestedDelegation === false) {
        // nested delegation 由 tool executor 层保证，这里只做 policy 级别声明
    }

    // 要求 plan + tasks artifacts 存在
    if (findRuntimeArtifact(artifacts, 'plan') === undefined || findRuntimeArtifact(artifacts, 'tasks') === undefined) {
        return {
            message: 'Review Group 缺少 plan 或 tasks artifact，不得执行。',
            summary: 'Review Group 缺少必要 artifact，已被拒绝',
        }
    }

    return null
}
