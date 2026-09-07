import { beforeEach, describe, expect, it, vi } from 'vitest'

import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'
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
        resolveModelSelection: vi.fn(),
        withStructuredOutput,
    }
})

vi.mock('@/lib/ai/model-provider', () => ({
    createChatModel: modelProviderMocks.createChatModel,
    getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    resolveModelSelection: modelProviderMocks.resolveModelSelection,
}))

function createCompactionModelSelection() {
    const item = modelCatalog.find(candidate => candidate.id === CHAT_MEMORY_COMPACTION_MODEL_ID)

    if (!item) {
        throw new Error(`Model catalog item not found in test: ${CHAT_MEMORY_COMPACTION_MODEL_ID}`)
    }

    return {
        modelId: item.id,
        provider: item.provider,
        providerModel: item.providerModel,
        routeType: 'chat' as const,
    }
}

describe('runtime/chat-memory structured compaction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // 注意：内部压缩模型允许在 catalog 中切换 provider，测试只验证行为，
        // 不把 deepseek family 固定到某个供应商。
        modelProviderMocks.resolveModelSelection.mockReturnValue(createCompactionModelSelection())
    })

    it('使用固定 internal model id、关闭 reasoning、非流式 structured output', async () => {
        modelProviderMocks.invoke.mockResolvedValue({
            pinnedDecisions: ['必须保持边界。'],
            summary: '更早对话摘要。',
        })

        const result = await generateStructuredCompaction({
            messages: [
                {
                    createdAt: new Date(100).toISOString(),
                    id: 'old-1',
                    role: 'user',
                    text: '更早问题',
                },
                {
                    createdAt: new Date(101).toISOString(),
                    id: 'old-2',
                    role: 'assistant',
                    text: '更早回答',
                },
                {
                    createdAt: new Date(102).toISOString(),
                    id: 'recent-1',
                    role: 'user',
                    text: '最近问题',
                },
                {
                    createdAt: new Date(103).toISOString(),
                    id: 'recent-2',
                    role: 'assistant',
                    text: '最近回答',
                },
            ],
            previousPinnedDecisions: ['旧边界'],
            previousSummary: '旧摘要',
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
                maxOutputTokens: 3000,
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
