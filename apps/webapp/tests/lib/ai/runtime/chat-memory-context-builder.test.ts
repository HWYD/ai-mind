import { describe, expect, it } from 'vitest'

import { type AiMindThreadState, buildChatMemoryContextMessages } from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory context builder', () => {
    it('注入 summary、pinned decisions 和 ThreadState recent messages 作为后端权威历史，不注入旧完整历史', () => {
        const state: AiMindThreadState = {
            messages: [
                {
                    createdAt: '2026-07-02T10:00:00.000Z',
                    id: 'recent-user',
                    role: 'user',
                    text: '最近问题',
                },
                {
                    createdAt: '2026-07-02T10:00:01.000Z',
                    id: 'recent-assistant',
                    role: 'assistant',
                    text: '最近回答',
                },
            ],
            pinnedDecisions: ['必须保持 stream-core chunk union 不变。'],
            summary: '更早对话摘要，包含架构背景。',
        }

        const messages = buildChatMemoryContextMessages(state)
        const content = messages.map(message => String(message.content)).join('\n')

        expect(messages.map(message => message._getType())).toEqual(['system', 'system', 'human', 'ai'])
        expect(content).toContain('更早对话摘要')
        expect(content).toContain('必须保持 stream-core chunk union 不变。')
        expect(content).toContain('最近问题')
        expect(content).toContain('最近回答')
        expect(content).not.toContain('第一轮完整原文')
    })

    it('空 state 不生成 memory context', () => {
        expect(buildChatMemoryContextMessages({ messages: [], pinnedDecisions: [], summary: '' })).toEqual([])
    })

    it('mixed tool / Tasklist / Delivery final turns 作为普通 text recent messages 注入', () => {
        const state: AiMindThreadState = {
            messages: [
                {
                    createdAt: '2026-07-02T10:00:00.000Z',
                    id: 'tool-user',
                    role: 'user',
                    text: '帮我执行工具',
                },
                {
                    createdAt: '2026-07-02T10:00:01.000Z',
                    id: 'tool-assistant',
                    role: 'assistant',
                    text: '这是 tool final answer。',
                },
                {
                    createdAt: '2026-07-02T10:00:02.000Z',
                    id: 'tasklist-user',
                    role: 'user',
                    text: '基于版本方案生成 tasklist',
                },
                {
                    createdAt: '2026-07-02T10:00:03.000Z',
                    id: 'tasklist-assistant',
                    role: 'assistant',
                    text: '已生成任务清单摘要。',
                },
                {
                    createdAt: '2026-07-02T10:00:04.000Z',
                    id: 'delivery-user',
                    role: 'user',
                    text: '生成交付计划',
                },
                {
                    createdAt: '2026-07-02T10:00:05.000Z',
                    id: 'delivery-assistant',
                    role: 'assistant',
                    text: '# Delivery Chain Report\n\n这是截断后的最终报告文本。',
                },
            ],
            pinnedDecisions: [],
            summary: '',
        }

        const messages = buildChatMemoryContextMessages(state)

        expect(messages.map(message => message._getType())).toEqual(['human', 'ai', 'human', 'ai', 'human', 'ai'])
        expect(messages.map(message => String(message.content)).join('\n')).toContain('已生成任务清单摘要。')
        expect(messages.map(message => String(message.content)).join('\n')).toContain('# Delivery Chain Report')
    })
})
