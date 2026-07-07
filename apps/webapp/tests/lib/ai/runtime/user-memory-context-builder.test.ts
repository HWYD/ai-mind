import { describe, expect, it } from 'vitest'

import { buildUserMemoryContextMessages } from '@/lib/ai/runtime/user-memory'

describe('runtime/user-memory context builder', () => {
    it('空 memory selection 返回空数组', () => {
        expect(buildUserMemoryContextMessages([])).toEqual([])
    })

    it('构建 supplemental system message 并声明 latest user message 优先', () => {
        const messages = buildUserMemoryContextMessages([
            {
                score: 5,
                stableKey: 'communication_preference:plain-language',
                tags: ['技术解释'],
                text: '用户喜欢技术解释先用大白话，再补充专业说法。',
                type: 'communication_preference',
            },
        ])

        expect(messages).toHaveLength(1)
        expect(messages[0]?.content).toContain('长期用户记忆补充上下文')
        expect(messages[0]?.content).toContain('latest user message')
        expect(messages[0]?.content).toContain('先用大白话')
    })

    it('单条和总长度都受限', () => {
        const messages = buildUserMemoryContextMessages([
            {
                score: 5,
                stableKey: 'workflow_preference:a',
                tags: ['prompt'],
                text: 'a'.repeat(400),
                type: 'workflow_preference',
            },
            {
                score: 4,
                stableKey: 'workflow_preference:b',
                tags: ['prompt'],
                text: 'b'.repeat(400),
                type: 'workflow_preference',
            },
            {
                score: 3,
                stableKey: 'workflow_preference:c',
                tags: ['prompt'],
                text: 'c'.repeat(400),
                type: 'workflow_preference',
            },
            {
                score: 2,
                stableKey: 'workflow_preference:d',
                tags: ['prompt'],
                text: 'd'.repeat(400),
                type: 'workflow_preference',
            },
        ])

        const content = String(messages[0]?.content ?? '')

        expect(content).toContain('a'.repeat(300))
        expect(content).toContain('b'.repeat(300))
        expect(content).toContain('c'.repeat(300))
        expect(content).not.toContain('d'.repeat(50))
    })
})
