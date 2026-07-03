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
})
