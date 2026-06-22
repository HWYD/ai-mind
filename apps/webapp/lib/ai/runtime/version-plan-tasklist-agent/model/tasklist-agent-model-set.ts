import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'

interface TasklistAgentModelPolicy {
    maxOutputTokens: number
    maxRetries: number
    requestTimeoutMs: number
    stepTimeoutMs: number
    temperature: number
}

export interface TasklistAgentModelStage {
    model: BaseChatModel
    timeoutMs: number
}

export interface TasklistAgentModelSet {
    drafting: TasklistAgentModelStage
    planning: TasklistAgentModelStage
}

export const TASKLIST_AGENT_MODEL_POLICIES = {
    drafting: {
        maxOutputTokens: 8192,
        maxRetries: 1,
        requestTimeoutMs: 120_000,
        stepTimeoutMs: 300_000,
        temperature: 0.3,
    },
    planning: {
        maxOutputTokens: 1024,
        maxRetries: 1,
        requestTimeoutMs: 45_000,
        stepTimeoutMs: 90_000,
        temperature: 0,
    },
} as const satisfies Record<'drafting' | 'planning', TasklistAgentModelPolicy>

export function createTasklistAgentModelSet(options: {
    enableReasoning?: boolean
    resolvedModelSelection: ResolvedModelSelection
}): TasklistAgentModelSet {
    const config = getModelProviderConfig()

    const planningHandle = createChatModel({
        config,
        enableReasoning: false,
        maxOutputTokens: TASKLIST_AGENT_MODEL_POLICIES.planning.maxOutputTokens,
        maxRetries: TASKLIST_AGENT_MODEL_POLICIES.planning.maxRetries,
        resolvedModelSelection: options.resolvedModelSelection,
        temperature: TASKLIST_AGENT_MODEL_POLICIES.planning.temperature,
        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.requestTimeoutMs,
    })
    const draftingHandle = createChatModel({
        config,
        enableReasoning: options.enableReasoning,
        maxOutputTokens: TASKLIST_AGENT_MODEL_POLICIES.drafting.maxOutputTokens,
        maxRetries: TASKLIST_AGENT_MODEL_POLICIES.drafting.maxRetries,
        resolvedModelSelection: options.resolvedModelSelection,
        temperature: TASKLIST_AGENT_MODEL_POLICIES.drafting.temperature,
        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.requestTimeoutMs,
    })

    return {
        drafting: {
            model: draftingHandle.model,
            timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.stepTimeoutMs,
        },
        planning: {
            model: planningHandle.model,
            timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.stepTimeoutMs,
        },
    }
}
