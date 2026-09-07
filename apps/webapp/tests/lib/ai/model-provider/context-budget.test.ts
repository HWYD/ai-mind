import { describe, expect, it } from 'vitest'

import { deriveContextBudget } from '@/lib/ai/model-provider/context-budget'

describe('context budget', () => {
    it('按云端 128K 运行窗口推导精确预算', () => {
        expect(
            deriveContextBudget({
                environment: 'cloud',
                maxOutputTokens: 4096,
                operationalCapTokens: 128000,
                physicalWindowTokens: 1_000_000,
            })
        ).toMatchObject({
            compactionTriggerTokens: 77772,
            effectiveWindowTokens: 128000,
            hardInputTokens: 111104,
            postCompactionTargetTokens: 38886,
            runtimeReserveTokens: 12800,
        })
    })

    it('按 Ollama 32K 运行窗口推导精确预算', () => {
        expect(
            deriveContextBudget({
                environment: 'ollama',
                maxOutputTokens: 4096,
                operationalCapTokens: 32768,
                physicalWindowTokens: 40000,
            })
        ).toMatchObject({
            compactionTriggerTokens: 14336,
            effectiveWindowTokens: 32768,
            hardInputTokens: 20480,
            postCompactionTargetTokens: 7168,
            runtimeReserveTokens: 8192,
        })
    })

    it('物理窗口更小时向下 clamp，并拒绝没有输入余量的配置', () => {
        expect(
            deriveContextBudget({
                environment: 'cloud',
                maxOutputTokens: 4096,
                operationalCapTokens: 128000,
                physicalWindowTokens: 16000,
            })
        ).toMatchObject({ effectiveWindowTokens: 16000, hardInputTokens: 3712 })

        expect(() =>
            deriveContextBudget({
                environment: 'ollama',
                maxOutputTokens: 4096,
                operationalCapTokens: 32768,
                physicalWindowTokens: 12288,
            })
        ).toThrow('input budget')
    })
})
