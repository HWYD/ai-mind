import { describe, expect, it } from 'vitest'

import { adaptFinalTurnCandidate, DELIVERY_FINAL_TEXT_LIMIT, DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE } from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory final-turn adapter', () => {
    it('rejects paused and failed outputs', () => {
        expect(
            adaptFinalTurnCandidate({
                assistantText: 'final answer',
                completionStatus: 'paused',
                source: 'tasklist-agent',
                userText: 'user goal',
            })
        ).toBeNull()

        expect(
            adaptFinalTurnCandidate({
                assistantText: 'failure report',
                completionStatus: 'failed',
                source: 'delivery-chain',
                userText: 'user goal',
            })
        ).toBeNull()
    })

    it('rejects non-string raw runtime objects', () => {
        expect(
            adaptFinalTurnCandidate({
                assistantText: { raw: 'runtime-object' } as unknown as string,
                completionStatus: 'completed',
                source: 'tool',
                userText: 'normal user input',
            })
        ).toBeNull()
    })

    it('keeps tasklist final answer text summary as trimmed text', () => {
        expect(
            adaptFinalTurnCandidate({
                assistantText: '  已生成任务清单摘要。  ',
                completionStatus: 'final',
                source: 'tasklist-agent',
                userText: '  基于版本方案生成 tasklist  ',
            })
        ).toEqual({
            assistantMessageId: undefined,
            assistantText: '已生成任务清单摘要。',
            completionStatus: 'final',
            source: 'tasklist-agent',
            userMessageId: undefined,
            userText: '基于版本方案生成 tasklist',
        })
    })

    it('deterministically truncates long delivery final report text', () => {
        const longReport = `# Delivery Chain Report\n\n${'A'.repeat(DELIVERY_FINAL_TEXT_LIMIT + 200)}`
        const adapted = adaptFinalTurnCandidate({
            assistantText: longReport,
            completionStatus: 'blocked',
            source: 'delivery-chain',
            userText: '生成交付计划',
        })

        expect(adapted).not.toBeNull()
        expect(adapted?.assistantText.length).toBeLessThanOrEqual(DELIVERY_FINAL_TEXT_LIMIT)
        expect(adapted?.assistantText.startsWith('# Delivery Chain Report')).toBe(true)
        expect(adapted?.assistantText.endsWith(DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE)).toBe(true)
    })
})
