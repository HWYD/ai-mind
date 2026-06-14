import type { LLMResult } from '@langchain/core/outputs'
import { describe, expect, it, vi } from 'vitest'

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createModelUsageCallback, logModelUsage, normalizeUsage } from '@/lib/ai/model-provider/usage/model-usage-observer'

function createUsageContext(overrides: Partial<ResolvedModelSelection> = {}) {
    return {
        modelId: 'qwen/qwen3.6-plus',
        provider: 'qwen' as const,
        providerModel: 'qwen3.6-plus',
        routeType: 'chat' as const,
        ...overrides,
    }
}

describe('model usage observer', () => {
    it('规范化 Qwen usage_metadata', () => {
        const usage = normalizeUsage(
            {
                generations: [[{ message: { usage_metadata: { input_tokens: 21, output_tokens: 34, total_tokens: 55 } } }]],
            },
            createUsageContext()
        )

        expect(usage).toEqual({
            estimated: undefined,
            inputTokens: 21,
            modelId: 'qwen/qwen3.6-plus',
            outputTokens: 34,
            provider: 'qwen',
            providerModel: 'qwen3.6-plus',
            routeType: 'chat',
            totalTokens: 55,
        })
    })

    it('规范化 DeepSeek response_metadata.tokenUsage', () => {
        const usage = normalizeUsage(
            {
                generations: [
                    [{ message: { response_metadata: { tokenUsage: { promptTokens: 13, completionTokens: 8, totalTokens: 21 } } } }],
                ],
            },
            createUsageContext({
                modelId: 'deepseek/deepseek-v4-pro',
                provider: 'deepseek',
                providerModel: 'deepseek-v4-pro',
                routeType: 'tasklist',
            })
        )

        expect(usage).toMatchObject({
            inputTokens: 13,
            outputTokens: 8,
            provider: 'deepseek',
            routeType: 'tasklist',
            totalTokens: 21,
        })
    })

    it('Ollama 未返回 usage metadata 时保留上下文且不抛错', () => {
        expect(() =>
            normalizeUsage(
                { generations: [[{ message: { content: 'hello' } }]] },
                createUsageContext({
                    modelId: 'ollama/qwen3-8b',
                    provider: 'ollama',
                    providerModel: 'qwen3:8b',
                })
            )
        ).not.toThrow()

        expect(
            normalizeUsage(undefined, {
                ...createUsageContext(),
                estimated: true,
            })
        ).toMatchObject({ estimated: true, inputTokens: undefined, outputTokens: undefined, totalTokens: undefined })
    })

    it('只记录规范化字段，并明确 usage 不是计费事实源', () => {
        const logger = vi.fn()

        logModelUsage(
            {
                inputTokens: 2,
                modelId: 'qwen/qwen3.6-plus',
                outputTokens: 3,
                provider: 'qwen',
                providerModel: 'qwen3.6-plus',
                routeType: 'chat',
                totalTokens: 5,
            },
            logger
        )

        expect(logger).toHaveBeenCalledWith(
            '[ai-mind:model-usage]',
            expect.objectContaining({ billingSource: false, metadataAvailable: true, totalTokens: 5 })
        )
        expect(JSON.stringify(logger.mock.calls)).not.toContain('apiKey')
        expect(JSON.stringify(logger.mock.calls)).not.toContain('prompt')
        expect(JSON.stringify(logger.mock.calls)).not.toContain('content')
    })

    it.each([
        ['qwen', createUsageContext(), { input_tokens: 5, output_tokens: 7, total_tokens: 12 }],
        [
            'deepseek',
            createUsageContext({
                modelId: 'deepseek/deepseek-v4-flash',
                provider: 'deepseek',
                providerModel: 'deepseek-v4-flash',
            }),
            { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
        ],
    ] as const)('%s 的 LangChain 回调可记录 provider usage metadata', (_provider, context, usageMetadata) => {
        const logger = vi.fn()
        const callback = createModelUsageCallback(context, logger)
        const output = {
            generations: [
                [
                    {
                        message: {
                            content: '完整模型输出不应进入 usage 日志',
                            response_metadata: { apiKey: 'secret-value' },
                            usage_metadata: usageMetadata,
                        },
                        text: '',
                    },
                ],
            ],
        } as unknown as LLMResult

        callback.handleLLMEnd?.(output, 'run-id')

        expect(logger).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(logger.mock.calls)).not.toContain('secret-value')
        expect(JSON.stringify(logger.mock.calls)).not.toContain('完整模型输出')
    })
})
