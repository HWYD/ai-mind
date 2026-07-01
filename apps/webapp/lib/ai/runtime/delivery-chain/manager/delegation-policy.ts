import { findRuntimeArtifact, hasRuntimeArtifact } from './runtime-artifacts'
import type { DelegationPolicy, RuntimeArtifact, SubagentToolId } from './types'

export const deliveryChainDelegationPolicy: DelegationPolicy = {
    allowedSubagentTools: ['plan-subagent', 'task-subagent', 'review-subagent'],
    allowNestedDelegation: false,
    allowParallel: false,
    maxToolCalls: 3,
    rejectOutOfOrderToolCalls: true,
    rejectUnregisteredTools: true,
    requirePlanBeforeTask: true,
    requireTasksBeforeReview: true,
}

export interface DelegationValidationFailure {
    message: string
    summary: string
}

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
