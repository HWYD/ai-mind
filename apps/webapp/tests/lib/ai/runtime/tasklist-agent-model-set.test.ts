import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(),
}))

vi.mock('@/lib/ai/model-provider', () => ({
    createChatModel: modelProviderMocks.createChatModel,
    getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
}))

import {
    createTasklistAgentModelSet,
    TASKLIST_AGENT_MODEL_POLICIES,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/model/tasklist-agent-model-set'

const resolvedModelSelection = {
    modelId: 'qwen/qwen3.6-flash',
    provider: 'qwen',
    providerModel: 'qwen3.6-flash',
    routeType: 'tasklist',
} as ResolvedModelSelection

describe('tasklist agent model set', () => {
    beforeEach(() => {
        modelProviderMocks.createChatModel.mockReset()
        modelProviderMocks.getModelProviderConfig.mockReset()
        modelProviderMocks.getModelProviderConfig.mockReturnValue({ marker: 'config' })
        modelProviderMocks.createChatModel
            .mockReturnValueOnce({ model: { stage: 'planning' } })
            .mockReturnValueOnce({ model: { stage: 'drafting' } })
    })

    it('为规划控制面和长文本草稿创建独立模型策略', () => {
        const models = createTasklistAgentModelSet({
            enableReasoning: true,
            resolvedModelSelection,
        })

        expect(modelProviderMocks.createChatModel).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                enableReasoning: false,
                maxOutputTokens: TASKLIST_AGENT_MODEL_POLICIES.planning.maxOutputTokens,
                maxRetries: TASKLIST_AGENT_MODEL_POLICIES.planning.maxRetries,
                temperature: TASKLIST_AGENT_MODEL_POLICIES.planning.temperature,
                timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.requestTimeoutMs,
            })
        )
        expect(modelProviderMocks.createChatModel).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                enableReasoning: true,
                maxOutputTokens: TASKLIST_AGENT_MODEL_POLICIES.drafting.maxOutputTokens,
                maxRetries: TASKLIST_AGENT_MODEL_POLICIES.drafting.maxRetries,
                temperature: TASKLIST_AGENT_MODEL_POLICIES.drafting.temperature,
                timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.requestTimeoutMs,
            })
        )
        expect(models).toEqual({
            drafting: {
                model: { stage: 'drafting' },
                timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.stepTimeoutMs,
            },
            planning: {
                model: { stage: 'planning' },
                timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.stepTimeoutMs,
            },
        })
    })
})
