import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiMindThreadState, ChatThreadMessage } from '@/lib/ai/runtime/chat-memory'
import {
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_SUMMARY_TARGET_LIMIT,
    compactionOutputSchema,
    compactThreadState,
} from '@/lib/ai/runtime/chat-memory'

function message(index: number): ChatThreadMessage {
    return {
        createdAt: new Date(index).toISOString(),
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: index === 1 ? '决定：v0.4.2 不保存 Tasklist GraphState 到 chat memory。' : `message ${index}`,
    }
}

function state(count: number): AiMindThreadState {
    return {
        messages: Array.from({ length: count }, (_, index) => message(index)),
        pinnedDecisions: [],
        summary: '',
    }
}

describe('runtime/chat-memory compaction', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('超过阈值后保留最近完整一轮消息，并把旧消息压缩到 summary/pins', async () => {
        const expectedRecentMessages = Array.from({ length: CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT }, (_, index) =>
            message(index + (CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 4 - CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT))
        )
        const compacted = await compactThreadState(state(CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 4), async () => ({
            pinnedDecisions: ['决定：v0.4.2 不保存 Tasklist GraphState 到 chat memory。'],
            summary: '更早对话已被压缩。',
        }))

        expect(compacted?.messages).toEqual(expectedRecentMessages)
        expect(compacted?.summary).toContain('更早对话已被压缩。')
        expect(compacted?.summary.length).toBeLessThanOrEqual(CHAT_MEMORY_SUMMARY_TARGET_LIMIT)
        expect(compacted?.pinnedDecisions).toContain('决定：v0.4.2 不保存 Tasklist GraphState 到 chat memory。')
        expect(compacted?.pinnedDecisions.length).toBeLessThanOrEqual(CHAT_MEMORY_PINNED_DECISION_LIMIT)
        expect(compacted?.lastCompactedAt).toBeTruthy()
        expect(compacted?.messages).toHaveLength(CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT)
        expect(compacted?.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    })

    it('未超过阈值时不压缩', async () => {
        const original = state(CHAT_MEMORY_RECENT_MESSAGE_LIMIT)

        await expect(compactThreadState(original)).resolves.toBe(original)
    })

    it('invalid model output 时返回 null，调用方可保持旧 state 不被破坏', async () => {
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const compacted = await compactThreadState(state(CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 1), async () => ({
            pinnedDecisions: [],
            // 缺少 summary，触发 schema 失败
        }))

        expect(compacted).toBeNull()
        expect(consoleInfoSpy).toHaveBeenCalledWith('[chat-memory-compaction]', expect.stringContaining('"event":"schema-parse-failed"'))
    })

    it('模型调用抛错时返回 null', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const compacted = await compactThreadState(state(CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 1), async () => {
            throw new Error('model timeout')
        })

        expect(compacted).toBeNull()
        expect(consoleErrorSpy).toHaveBeenCalled()
        expect(consoleInfoSpy).toHaveBeenCalledWith('[chat-memory-compaction]', expect.stringContaining('"event":"generator-failed"'))
    })

    it('只接受 summary 与 pinnedDecisions，额外字段会被拒绝', async () => {
        const compacted = await compactThreadState(state(CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 1), async () => ({
            compactedAt: new Date().toISOString(),
            pinnedDecisions: [],
            recentMessages: [],
            summary: 'unexpected extra fields',
        }))

        expect(compacted).toBeNull()
    })

    it('compaction schema 只允许 summary 与 pinnedDecisions', () => {
        expect(
            compactionOutputSchema.parse({
                pinnedDecisions: ['必须保持边界。'],
                summary: '更早对话摘要。',
            })
        ).toEqual({
            pinnedDecisions: ['必须保持边界。'],
            summary: '更早对话摘要。',
        })

        expect(() =>
            compactionOutputSchema.parse({
                compactedAt: new Date().toISOString(),
                pinnedDecisions: [],
                summary: 'extra field',
            })
        ).toThrow()
    })

    it('mixed final turns 进入 compaction 时仍保持 text-only，已截断 delivery report 会原样保留在 recent messages', async () => {
        const truncatedDeliveryReport = `# Delivery Chain Report\n\n${'D'.repeat(7_972)}`
        let capturedInput:
            | {
                  messagesToCompact: ChatThreadMessage[]
                  previousPinnedDecisions: string[]
                  previousSummary: string
                  recentMessages: ChatThreadMessage[]
              }
            | undefined
        const mixedState: AiMindThreadState = {
            messages: [
                ...Array.from({ length: CHAT_MEMORY_RECENT_MESSAGE_LIMIT }, (_, index) => message(index)),
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
                    text: 'tool final answer',
                },
                {
                    createdAt: '2026-07-02T10:00:02.000Z',
                    id: 'delivery-user',
                    role: 'user',
                    text: '生成交付计划',
                },
                {
                    createdAt: '2026-07-02T10:00:03.000Z',
                    id: 'delivery-assistant',
                    role: 'assistant',
                    text: truncatedDeliveryReport,
                },
            ],
            pinnedDecisions: [],
            summary: '',
        }

        const compacted = await compactThreadState(mixedState, async input => {
            capturedInput = input
            return {
                pinnedDecisions: ['必须保持 raw runtime state 不进入 chat memory。'],
                summary: '更早消息已压缩。',
            }
        })

        expect(capturedInput?.recentMessages.map(item => item.id)).toEqual([
            'tool-user',
            'tool-assistant',
            'delivery-user',
            'delivery-assistant',
        ])
        expect(Object.keys(capturedInput?.recentMessages[3] ?? {}).sort()).toEqual(['createdAt', 'id', 'role', 'text'])
        expect(compacted?.messages[3]?.text).toBe(truncatedDeliveryReport)
        expect(compacted?.messages[3]?.text.length).toBe(truncatedDeliveryReport.length)
        expect(Object.keys(capturedInput?.recentMessages[1] ?? {}).sort()).toEqual(['createdAt', 'id', 'role', 'text'])
        expect(compacted?.messages[1]?.text).toBe('tool final answer')
        expect(compacted?.messages[1]?.text.length).toBe('tool final answer'.length)
        expect(compacted?.messages[3]?.text.length).toBe(truncatedDeliveryReport.length)
    })
})
