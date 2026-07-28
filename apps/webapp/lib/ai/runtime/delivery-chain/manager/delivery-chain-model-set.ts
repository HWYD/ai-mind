import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'

import type { SubagentToolId } from './subagent-tool-schemas'

type DeliveryChainStageName = 'manager' | 'plan' | 'task' | 'review'

interface DeliveryChainModelPolicy {
    maxRetries: number
    requestTimeoutMs: number
    temperature: number
}

export interface DeliveryChainModelStage {
    handle: AiMindChatModelHandle
    timeoutMs: number
}

export interface DeliveryChainModelSet {
    manager: DeliveryChainModelStage
    subagents: Record<SubagentToolId, DeliveryChainModelStage>
}

export const DELIVERY_CHAIN_MODEL_POLICIES = {
    manager: { maxRetries: 1, requestTimeoutMs: 120_000, temperature: 0 },
    plan: { maxRetries: 1, requestTimeoutMs: 180_000, temperature: 0.2 },
    task: { maxRetries: 1, requestTimeoutMs: 180_000, temperature: 0.2 },
    review: { maxRetries: 1, requestTimeoutMs: 120_000, temperature: 0.1 },
} as const satisfies Record<DeliveryChainStageName, DeliveryChainModelPolicy>

const SUBAGENT_STAGE_BY_ID: Record<SubagentToolId, DeliveryChainStageName> = {
    'boundary-subagent': 'review',
    'plan-subagent': 'plan',
    'review-subagent': 'review',
    'risk-subagent': 'review',
    'task-subagent': 'task',
}

export function createDeliveryChainModelSet(options: { resolvedModelSelection: ResolvedModelSelection }): DeliveryChainModelSet {
    const config = getModelProviderConfig()
    const stages = Object.fromEntries(
        (Object.keys(DELIVERY_CHAIN_MODEL_POLICIES) as DeliveryChainStageName[]).map(stageName => {
            const policy = DELIVERY_CHAIN_MODEL_POLICIES[stageName]
            const handle = createChatModel({
                config,
                enableReasoning: false,
                maxRetries: policy.maxRetries,
                retryableErrorsOnly: true,
                resolvedModelSelection: options.resolvedModelSelection,
                streaming: false,
                temperature: policy.temperature,
                timeoutMs: policy.requestTimeoutMs,
            })

            return [stageName, { handle, timeoutMs: policy.requestTimeoutMs }]
        })
    ) as Record<DeliveryChainStageName, DeliveryChainModelStage>

    return {
        manager: stages.manager,
        subagents: Object.fromEntries(
            (Object.keys(SUBAGENT_STAGE_BY_ID) as SubagentToolId[]).map(subagentId => [
                subagentId,
                stages[SUBAGENT_STAGE_BY_ID[subagentId]],
            ])
        ) as Record<SubagentToolId, DeliveryChainModelStage>,
    }
}
