import { HumanMessage } from '@langchain/core/messages'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createChatModel, getModelProviderConfig, resolveModelSelection } from '@/lib/ai/model-provider'

const describeCloudUsageSmoke =
    process.env.AI_MIND_RUN_EXTERNAL_TESTS === '1' || process.env.AI_MIND_RUN_CLOUD_USAGE_SMOKE === '1' ? describe : describe.skip

describeCloudUsageSmoke('cloud model usage smoke', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.each(['qwen/qwen3.6-flash', 'deepseek/deepseek-v4-flash'] as const)('%s 返回的 usage metadata 可被规范化记录', async modelId => {
        const usageLogger = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const resolvedModelSelection = resolveModelSelection({ modelId, routeType: 'chat' })
        const modelHandle = createChatModel({
            config: getModelProviderConfig(),
            enableReasoning: false,
            maxOutputTokens: 32,
            resolvedModelSelection,
        })

        await modelHandle.model.invoke([new HumanMessage('Reply with exactly USAGE_SMOKE_OK.')])

        const usageCall = usageLogger.mock.calls.find(([message]) => message === '[ai-mind:model-usage]')

        expect(usageCall).toBeDefined()
        expect(usageCall?.[1]).toMatchObject({
            billingSource: false,
            metadataAvailable: true,
            modelId,
            provider: resolvedModelSelection.provider,
            providerModel: resolvedModelSelection.providerModel,
            routeType: 'chat',
        })
    })
})
