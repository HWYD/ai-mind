import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { estimateModelInputTokens } from '@/lib/ai/model-provider'
import { type AiMindThreadState, buildChatMemoryContextMessages, fitChatMemoryContextMessages } from '@/lib/ai/runtime/chat-memory'

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

    it('ephemeral fit 从 newest pin 开始保留完整 pins，再保留 summary 与完整最新 turns，且不改 durable state', () => {
        const state: AiMindThreadState = {
            messages: [
                { createdAt: '2026-09-01T00:00:00.000Z', id: 'u1', role: 'user', text: 'old turn user' },
                { createdAt: '2026-09-01T00:00:01.000Z', id: 'a1', role: 'assistant', text: 'old turn assistant' },
                { createdAt: '2026-09-01T00:00:02.000Z', id: 'u2', role: 'user', text: 'new turn user' },
                { createdAt: '2026-09-01T00:00:03.000Z', id: 'a2', role: 'assistant', text: 'new turn assistant' },
            ],
            pinnedDecisions: ['oldest pin that does not fit', 'newest pin that fits'],
            summary: 'summary that may be shortened for this request only',
        }
        const nonMemory = [new SystemMessage('dynamic non-memory system instruction')]
        const hardInputTokens = estimateModelInputTokens([
            ...nonMemory,
            ...buildChatMemoryContextMessages({
                messages: [],
                pinnedDecisions: ['newest pin that fits'],
                summary: '',
            }),
        ]).estimatedTokens

        const projection = fitChatMemoryContextMessages(state, {
            assemble: memory => [...nonMemory, ...memory],
            hardInputTokens,
        })

        expect(projection.pinnedDecisions).toEqual(['newest pin that fits'])
        expect(projection.summary).toBe('')
        expect(projection.messages).toEqual([])
        expect(projection.memoryMessages).toEqual(buildChatMemoryContextMessages(projection))
        expect(estimateModelInputTokens([...nonMemory, ...projection.memoryMessages]).estimatedTokens).toBeLessThanOrEqual(hardInputTokens)
        expect(state.pinnedDecisions).toEqual(['oldest pin that does not fit', 'newest pin that fits'])
        expect(state.messages).toHaveLength(4)
    })

    it('最新 pin 自身放不下时不回退保留更旧 pin，避免违反 newest-first 优先级', () => {
        const state: AiMindThreadState = {
            messages: [],
            pinnedDecisions: ['older pin that would fit by itself', 'newest pin ' + 'token '.repeat(2_000)],
            summary: '',
        }
        const nonMemory = [new SystemMessage('dynamic non-memory system instruction')]
        const hardInputTokens = estimateModelInputTokens([
            ...nonMemory,
            ...buildChatMemoryContextMessages({
                messages: [],
                pinnedDecisions: ['older pin that would fit by itself'],
                summary: '',
            }),
        ]).estimatedTokens

        const projection = fitChatMemoryContextMessages(state, {
            assemble: memory => [...nonMemory, ...memory],
            hardInputTokens,
        })

        expect(projection.pinnedDecisions).toEqual([])
        expect(projection.memoryMessages).toEqual([])
        expect(state.pinnedDecisions).toHaveLength(2)
    })
})
