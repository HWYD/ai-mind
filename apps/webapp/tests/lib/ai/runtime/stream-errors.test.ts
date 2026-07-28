import { describe, expect, it } from 'vitest'

import { normalizeKnownRuntimeError } from '@/lib/ai/runtime/stream-errors'

describe('normalizeKnownRuntimeError', () => {
    it('returns chat memory setup guidance without exposing the relation name', () => {
        const result = normalizeKnownRuntimeError(new Error('relation "langgraph_chat_memory.checkpoints" does not exist'))

        expect(result).toEqual(
            expect.objectContaining({
                code: 'RUNTIME_INVARIANT_FAILED',
                retryable: false,
            })
        )
        expect(result?.message).toContain('db:chat-memory:setup')
        expect(result?.message).not.toContain('langgraph_chat_memory')
    })
})
