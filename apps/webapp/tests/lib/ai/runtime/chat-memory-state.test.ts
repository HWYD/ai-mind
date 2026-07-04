import { describe, expect, it } from 'vitest'

import {
    aiMindThreadStateSchema,
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT,
    CHAT_MEMORY_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_RECENT_TURN_LIMIT,
    createEmptyThreadState,
    normalizeCheckpointThreadState,
    threadHydrationDtoSchema,
} from '@/lib/ai/runtime/chat-memory'

function createMessage(index: number) {
    return {
        id: `message-${index}`,
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        text: `message ${index}`,
        createdAt: new Date(index).toISOString(),
    }
}

describe('runtime/chat-memory state schema', () => {
    it('初始化为空 ThreadState', () => {
        expect(createEmptyThreadState()).toEqual({
            messages: [],
            pinnedDecisions: [],
            summary: '',
        })
    })

    it('只允许 bounded text-only messages', () => {
        expect(
            aiMindThreadStateSchema.parse({
                messages: Array.from({ length: CHAT_MEMORY_RECENT_MESSAGE_LIMIT }, (_, index) => createMessage(index)),
                pinnedDecisions: [],
                summary: '',
            }).messages
        ).toHaveLength(CHAT_MEMORY_RECENT_MESSAGE_LIMIT)

        expect(() =>
            aiMindThreadStateSchema.parse({
                messages: Array.from({ length: CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 1 }, (_, index) => createMessage(index)),
                pinnedDecisions: [],
                summary: '',
            })
        ).toThrow()
    })

    it('checkpoint parser 允许读取旧的 over-limit messages，交由 service 后续压缩', () => {
        const state = normalizeCheckpointThreadState({
            messages: Array.from({ length: CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 2 }, (_, index) => createMessage(index)),
            pinnedDecisions: [],
            summary: '',
        })

        expect(state.messages).toHaveLength(CHAT_MEMORY_RECENT_MESSAGE_LIMIT + 2)
    })

    it('recent turn limit 以完整轮次定义，并派生消息窗口', () => {
        expect(CHAT_MEMORY_RECENT_TURN_LIMIT).toBeGreaterThanOrEqual(2)
        expect(CHAT_MEMORY_RECENT_MESSAGE_LIMIT).toBe(CHAT_MEMORY_RECENT_TURN_LIMIT * 2)
        expect(CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT).toBeGreaterThanOrEqual(1)
        expect(CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT).toBeLessThanOrEqual(CHAT_MEMORY_RECENT_TURN_LIMIT)
        expect(CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT).toBe(CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT * 2)
        expect(CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT).toBeLessThanOrEqual(CHAT_MEMORY_RECENT_MESSAGE_LIMIT)
    })

    it('限制 summary 和 pinned decisions', () => {
        expect(() =>
            aiMindThreadStateSchema.parse({
                messages: [],
                pinnedDecisions: Array.from({ length: CHAT_MEMORY_PINNED_DECISION_LIMIT + 1 }, (_, index) => `decision ${index}`),
                summary: '',
            })
        ).toThrow()

        expect(() =>
            aiMindThreadStateSchema.parse({
                messages: [],
                pinnedDecisions: [],
                summary: 'a'.repeat(2501),
            })
        ).toThrow()
    })

    it('拒绝 raw runtime 字段进入 ThreadState', () => {
        expect(() =>
            aiMindThreadStateSchema.parse({
                checkpoint: {},
                messages: [],
                pinnedDecisions: [],
                rawPrompt: 'secret prompt',
                summary: '',
            })
        ).toThrow()

        expect(() =>
            aiMindThreadStateSchema.parse({
                messages: [
                    {
                        createdAt: new Date().toISOString(),
                        displayKind: 'tool-final',
                        id: 'message-1',
                        role: 'assistant',
                        source: 'tool',
                        text: 'tool answer',
                    },
                ],
                pinnedDecisions: [],
                summary: '',
            })
        ).toThrow()
    })

    it('hydration DTO 是 strict safe public shape', () => {
        expect(() =>
            threadHydrationDtoSchema.parse({
                threadId: 'chat:' + 'a'.repeat(64),
                messages: [],
                pinnedDecisions: [],
                restored: false,
                rawCheckpoint: {},
            })
        ).toThrow()
    })
})
