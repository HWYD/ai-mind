import { describe, expect, it } from 'vitest'

import {
    CHAT_MEMORY_CHECKPOINT_SCHEMA,
    createPostgresChatMemoryCheckpointer,
    getChatMemoryCheckpointer,
} from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory checkpointer provider', () => {
    it('off 不创建 checkpointer', () => {
        expect(getChatMemoryCheckpointer('off', {})).toBeUndefined()
    })

    it('memory 在进程内复用同一个实例', () => {
        const first = getChatMemoryCheckpointer('memory', {})
        const second = getChatMemoryCheckpointer('memory', {})

        expect(first).toBe(second)
    })

    it('postgres 缺少 DATABASE_URL 时 fail closed', () => {
        expect(() => getChatMemoryCheckpointer('postgres', {})).toThrow(
            'DATABASE_URL is required when AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres.'
        )
    })

    it('checkpoint 使用 chat memory 独立 PostgreSQL schema', () => {
        expect(CHAT_MEMORY_CHECKPOINT_SCHEMA).toBe('langgraph_chat_memory')
    })

    it('空 connection string 不创建 postgres saver', () => {
        expect(() => createPostgresChatMemoryCheckpointer(' ')).toThrow(
            'DATABASE_URL is required when AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres.'
        )
    })
})
