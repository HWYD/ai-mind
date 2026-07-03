import { describe, expect, it } from 'vitest'

import { getChatMemoryRuntimeConfig } from '@/lib/ai/runtime/chat-memory'

describe('runtime/chat-memory runtime config', () => {
    it('development 默认使用 memory checkpoint', () => {
        expect(getChatMemoryRuntimeConfig({}, 'development')).toEqual({
            checkpointMode: 'memory',
        })
    })

    it('production 默认使用 postgres checkpoint', () => {
        expect(getChatMemoryRuntimeConfig({}, 'production')).toEqual({
            checkpointMode: 'postgres',
        })
    })

    it('允许显式关闭 chat memory', () => {
        expect(getChatMemoryRuntimeConfig({ AI_MIND_CHAT_MEMORY_CHECKPOINT: 'off' }, 'production')).toEqual({
            checkpointMode: 'off',
        })
    })

    it('允许显式选择 memory 或 postgres', () => {
        expect(getChatMemoryRuntimeConfig({ AI_MIND_CHAT_MEMORY_CHECKPOINT: 'memory' }, 'production').checkpointMode).toBe('memory')
        expect(getChatMemoryRuntimeConfig({ AI_MIND_CHAT_MEMORY_CHECKPOINT: 'postgres' }, 'development').checkpointMode).toBe('postgres')
    })

    it('非法值 fail closed 为 off', () => {
        expect(getChatMemoryRuntimeConfig({ AI_MIND_CHAT_MEMORY_CHECKPOINT: 'disk' }, 'development')).toEqual({
            checkpointMode: 'off',
        })
    })
})
