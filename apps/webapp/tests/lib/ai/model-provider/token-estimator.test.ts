import { describe, expect, it } from 'vitest'

import { estimateModelInputTokens } from '@/lib/ai/model-provider/token-estimator'

describe('token estimator', () => {
    it('覆盖 role、文本、structured tool payload 与 framing，并保留 10% safety margin', () => {
        const estimate = estimateModelInputTokens([
            { content: 'system instructions', role: 'system' },
            {
                content: 'calling a tool',
                role: 'assistant',
                tool_calls: [{ args: { city: 'Shanghai' }, id: 'call-1', name: 'weather' }],
            },
            { content: { result: 'sunny' }, role: 'tool', tool_call_id: 'call-1' },
        ])

        expect(estimate.framingTokens).toBe(27)
        expect(estimate.messageTokens).toBeGreaterThan(0)
        expect(estimate.structuredPayloadTokens).toBeGreaterThan(0)
        expect(estimate.safetyMarginTokens).toBeGreaterThan(0)
        expect(estimate.estimatedTokens).toBe(
            estimate.messageTokens + estimate.structuredPayloadTokens + estimate.framingTokens + estimate.safetyMarginTokens
        )
    })

    it('把请求级的 tool definition 等非 message 结构化 payload 纳入估算', () => {
        const withoutToolDefinition = estimateModelInputTokens([{ content: 'latest question', role: 'user' }])
        const withToolDefinition = estimateModelInputTokens([{ content: 'latest question', role: 'user' }], {
            nonMessagePayloads: [
                {
                    function: {
                        description: 'tool definition '.repeat(2_000),
                        name: 'search',
                        parameters: { properties: { query: { type: 'string' } }, type: 'object' },
                    },
                    type: 'function',
                },
            ],
        })

        expect(withToolDefinition.structuredPayloadTokens).toBeGreaterThan(withoutToolDefinition.structuredPayloadTokens)
        expect(withToolDefinition.estimatedTokens).toBeGreaterThan(withoutToolDefinition.estimatedTokens)
    })
})
