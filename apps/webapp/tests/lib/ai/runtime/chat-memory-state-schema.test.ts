import { describe, expect, it } from 'vitest'

import { aiMindThreadStateSchema, normalizeCheckpointThreadState } from '@/lib/ai/runtime/chat-memory'

function completeTurn(index: number) {
    return [
        {
            createdAt: new Date(index * 2).toISOString(),
            id: `user-${index}`,
            role: 'user' as const,
            text: `user ${index}`,
        },
        {
            createdAt: new Date(index * 2 + 1).toISOString(),
            id: `assistant-${index}`,
            role: 'assistant' as const,
            text: `assistant ${index}`,
        },
    ]
}

describe('runtime/chat-memory token-aware state schema', () => {
    it('accepts a legacy checkpoint with more than four complete messages', () => {
        const messages = Array.from({ length: 3 }, (_, index) => completeTurn(index)).flat()

        expect(
            aiMindThreadStateSchema.parse({
                messages,
                pinnedDecisions: [],
                summary: '',
            }).messages
        ).toEqual(messages)
        expect(normalizeCheckpointThreadState({ messages, pinnedDecisions: [], summary: '' }).messages).toEqual(messages)
    })

    it('rejects a checkpoint whose raw messages end in an incomplete turn', () => {
        expect(() =>
            aiMindThreadStateSchema.parse({
                messages: completeTurn(0).concat({
                    createdAt: new Date().toISOString(),
                    id: 'orphan-user',
                    role: 'user',
                    text: 'orphan user message',
                }),
                pinnedDecisions: [],
                summary: '',
            })
        ).toThrow('complete user/assistant turns')
    })
})
