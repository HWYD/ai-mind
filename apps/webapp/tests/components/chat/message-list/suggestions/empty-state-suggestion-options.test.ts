import { describe, expect, it } from 'vitest'

import {
    deliveryChainDemoSuggestion,
    emptyStateSuggestions,
    imageGenerationDemoSuggestion,
    tasklistDemoSuggestion,
} from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'

describe('emptyStateSuggestions', () => {
    it('keeps the Tasklist example payload stable as a named suggestion export', () => {
        expect(emptyStateSuggestions).toContain(tasklistDemoSuggestion)
        expect(tasklistDemoSuggestion.composer?.command?.name).toBe('tasklist')
        expect(tasklistDemoSuggestion.composer?.references).toEqual([
            expect.objectContaining({
                label: 'v034-langsmith-observability.md',
                uri: 'demo://version-plans/v034-langsmith-observability.md',
            }),
        ])
        expect(tasklistDemoSuggestion.displaySegments).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'command' }), expect.objectContaining({ type: 'resource' })])
        )
        expect(tasklistDemoSuggestion.text).toBe('基于这个 demo 版本方案生成 tasklist 草稿')
    })

    it('keeps the Delivery example payload stable as a named suggestion export', () => {
        expect(emptyStateSuggestions).toContain(deliveryChainDemoSuggestion)
        expect(deliveryChainDemoSuggestion.composer?.command?.name).toBe('delivery-chain')
        expect(deliveryChainDemoSuggestion.composer?.command?.label).toBe('生成交付计划')
        expect(deliveryChainDemoSuggestion.text).toBe('')
        expect(deliveryChainDemoSuggestion.composer?.plainText).toBe('')
        expect(deliveryChainDemoSuggestion.composer?.references).toEqual([
            expect.objectContaining({
                label: '注册登录系统',
                uri: 'demo://scenarios/register-login/requirement.md',
            }),
        ])
        expect(deliveryChainDemoSuggestion.displaySegments).toEqual(
            expect.arrayContaining([expect.objectContaining({ type: 'command' }), expect.objectContaining({ type: 'resource' })])
        )
    })

    it('keeps the Image Agent example payload as the immediate /image shortcut', () => {
        expect(emptyStateSuggestions).toContain(imageGenerationDemoSuggestion)
        expect(imageGenerationDemoSuggestion.composer).toEqual({
            command: { label: '生成图片', name: 'image' },
            plainText: '阳光正好，一只橘猫在沙滩上睡懒觉。',
        })
        expect(imageGenerationDemoSuggestion.displaySegments).toEqual([
            expect.objectContaining({ type: 'command' }),
            expect.objectContaining({ text: ' 阳光正好，一只橘猫在沙滩上睡懒觉。', type: 'text' }),
        ])
    })
})
