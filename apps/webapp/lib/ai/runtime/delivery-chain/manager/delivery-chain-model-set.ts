import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel, getModelProviderConfig, ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider'

import type { SubagentToolId } from './subagent-tool-schemas'

type DeliveryChainStageName = 'manager' | 'plan' | 'task' | 'review'

export const DELIVERY_CHAIN_CONTRACT_MODEL_ID = 'deepseek/deepseek-v4-pro'

interface DeliveryChainModelPolicy {
    maxRetries: number
    requestTimeoutMs: number
    temperature: number
}

export interface DeliveryChainModelStage {
    /** 用户选定的模型：负责角色的业务判断与生成内容。 */
    handle: AiMindChatModelHandle
    /** 固定服务端模型：仅将角色输出通过严格 Contract 编码传输。 */
    contractHandle: AiMindChatModelHandle
    timeoutMs: number
}

export interface DeliveryChainModelSet {
    manager: DeliveryChainModelStage
    subagents: Record<SubagentToolId, DeliveryChainModelStage>
}

export class DeliveryChainModelCapabilityError extends Error {
    readonly code = 'MODEL_DOES_NOT_SUPPORT_JSON_OUTPUT'

    constructor(modelId = DELIVERY_CHAIN_CONTRACT_MODEL_ID) {
        super(`Delivery Chain requires a model with structured JSON output capability: ${modelId}`)
        this.name = 'DeliveryChainModelCapabilityError'
    }
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
    const { resolvedModelSelection } = options
    let contractModelSelection: ResolvedModelSelection

    try {
        contractModelSelection = resolveModelSelection({
            modelId: DELIVERY_CHAIN_CONTRACT_MODEL_ID,
            requireJsonOutput: true,
            routeType: 'delivery-chain',
        })
    } catch (error) {
        if (error instanceof ModelSelectionError && error.code === 'MODEL_DOES_NOT_SUPPORT_JSON_OUTPUT') {
            throw new DeliveryChainModelCapabilityError()
        }

        throw error
    }

    const config = getModelProviderConfig()
    const stages = Object.fromEntries(
        (Object.keys(DELIVERY_CHAIN_MODEL_POLICIES) as DeliveryChainStageName[]).map(stageName => {
            const policy = DELIVERY_CHAIN_MODEL_POLICIES[stageName]
            const handle = createChatModel({
                config,
                enableReasoning: false,
                maxRetries: policy.maxRetries,
                retryableErrorsOnly: true,
                resolvedModelSelection,
                streaming: false,
                temperature: policy.temperature,
                timeoutMs: policy.requestTimeoutMs,
            })
            const contractHandle = createChatModel({
                config,
                enableReasoning: false,
                maxRetries: policy.maxRetries,
                retryableErrorsOnly: true,
                resolvedModelSelection: contractModelSelection,
                streaming: false,
                temperature: 0,
                timeoutMs: policy.requestTimeoutMs,
            })

            return [stageName, { contractHandle, handle, timeoutMs: policy.requestTimeoutMs }]
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
