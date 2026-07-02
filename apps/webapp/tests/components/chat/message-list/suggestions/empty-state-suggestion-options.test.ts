import { describe, expect, it } from 'vitest'

import { emptyStateSuggestions } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'

describe('emptyStateSuggestions', () => {
    it('includes the Tasklist Agent demo quick access entry with the v034 demo version', () => {
        const tasklistDemo = emptyStateSuggestions.find(suggestion => suggestion.label === 'Tasklist Agent Demo')

        expect(tasklistDemo).toBeTruthy()
        expect(tasklistDemo?.composer?.command?.name).toBe('tasklist')
        expect(tasklistDemo?.composer?.references).toEqual([
            expect.objectContaining({
                label: 'v034-langsmith-observability.md',
                uri: 'demo://version-plans/v034-langsmith-observability.md',
            }),
        ])
        expect(JSON.stringify(tasklistDemo)).not.toContain('v035')
        expect(JSON.stringify(tasklistDemo)).not.toContain('v036')
    })

    it('includes the Delivery Chain demo quick access entry with the request-limit-banner scenario', () => {
        const deliveryChainDemo = emptyStateSuggestions.find(suggestion => suggestion.label === 'Delivery Chain Demo')

        expect(deliveryChainDemo).toBeTruthy()
        expect(deliveryChainDemo?.composer?.command?.name).toBe('delivery-chain')
        expect(deliveryChainDemo?.composer?.command?.label).toBe('生成交付计划')
        expect(deliveryChainDemo?.text).toBe('')
        expect(deliveryChainDemo?.composer?.plainText).toBe('')
        expect(deliveryChainDemo?.composer?.references).toEqual([
            expect.objectContaining({
                label: 'request-limit-banner/requirement.md',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
            }),
        ])
    })
})
