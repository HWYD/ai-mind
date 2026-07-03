import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT } from '@/lib/ai/runtime/chat-memory'
import { CHAT_MEMORY_COMPACTION_MODEL_ID, generateStructuredCompaction } from '@/lib/ai/runtime/chat-memory/compaction'

const modelProviderMocks = vi.hoisted(() => {
    const invoke = vi.fn()
    const withStructuredOutput = vi.fn(() => ({ invoke }))

    return {
        createChatModel: vi.fn(() => ({
            model: {
                withStructuredOutput,
            },
        })),
        getModelProviderConfig: vi.fn(() => ({ marker: 'config' })),
        invoke,
        resolveModelSelection: vi.fn(() => ({
            modelId: 'deepseek/deepseek-v4-pro',
            provider: 'qwen',
            providerModel: 'deepseek-v4-pro',
            routeType: 'chat',
        })),
        withStructuredOutput,
    }
})

vi.mock('@/lib/ai/model-provider', () => ({
    createChatModel: modelProviderMocks.createChatModel,
    getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    resolveModelSelection: modelProviderMocks.resolveModelSelection,
}))

describe('runtime/chat-memory structured compaction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('使用固定 internal model id、关闭 reasoning、非流式 structured output', async () => {
        modelProviderMocks.invoke.mockResolvedValue({
            pinnedDecisions: ['必须保持边界。'],
            summary: '更早对话摘要。',
        })

        const recentMessages = Array.from({ length: CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT }, (_, index) => ({
            createdAt: new Date(index).toISOString(),
            id: `recent-${index}`,
            role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
            text: `recent ${index}`,
        }))

        const result = await generateStructuredCompaction({
            messagesToCompact: [
                {
                    createdAt: new Date(100).toISOString(),
                    id: 'old-1',
                    role: 'user',
                    text: '更早问题',
                },
            ],
            previousPinnedDecisions: ['旧边界'],
            previousSummary: '旧摘要',
            recentMessages,
        })

        expect(result).toEqual({
            pinnedDecisions: ['必须保持边界。'],
            summary: '更早对话摘要。',
        })
        expect(modelProviderMocks.resolveModelSelection).toHaveBeenCalledWith({
            modelId: CHAT_MEMORY_COMPACTION_MODEL_ID,
            routeType: 'chat',
        })
        expect(modelProviderMocks.createChatModel).toHaveBeenCalledWith(
            expect.objectContaining({
                config: { marker: 'config' },
                enableReasoning: false,
                resolvedModelSelection: expect.objectContaining({
                    modelId: CHAT_MEMORY_COMPACTION_MODEL_ID,
                }),
                streaming: false,
                temperature: 0,
            })
        )
        expect(modelProviderMocks.withStructuredOutput).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                name: 'ai_mind_chat_memory_compaction',
            })
        )
        expect(modelProviderMocks.invoke).toHaveBeenCalledTimes(1)
    })
})
