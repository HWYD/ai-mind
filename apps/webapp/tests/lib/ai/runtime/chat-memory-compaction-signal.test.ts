import { describe, expect, it, vi } from 'vitest'

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(() => ({})),
    resolveModelSelection: vi.fn(() => ({
        modelId: 'deepseek/deepseek-v4-pro',
        provider: 'deepseek',
        providerModel: 'deepseek-v4-pro',
        routeType: 'chat',
    })),
}))

vi.mock('@/lib/ai/model-provider', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/model-provider')>()

    return {
        ...actual,
        createChatModel: modelProviderMocks.createChatModel,
        getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
        resolveModelSelection: modelProviderMocks.resolveModelSelection,
    }
})

import { generateStructuredCompaction } from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory compaction signal', () => {
    it('passes the request AbortSignal to the structured compaction model invocation', async () => {
        const abortController = new AbortController()
        const invoke = vi.fn().mockResolvedValue({ pinnedDecisions: [], summary: 'compacted summary' })
        const withStructuredOutput = vi.fn().mockReturnValue({ invoke })
        modelProviderMocks.createChatModel.mockReturnValue({
            model: {
                withStructuredOutput,
            },
        })
        await generateStructuredCompaction(
            {
                messages: [],
                previousPinnedDecisions: [],
                previousSummary: '',
            },
            { signal: abortController.signal }
        )

        expect(invoke).toHaveBeenCalledWith(expect.any(Array), { signal: abortController.signal })
    })
})
