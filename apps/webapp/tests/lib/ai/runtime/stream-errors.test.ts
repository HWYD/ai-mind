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

    it('uses data-service guidance for shared Prisma failures without leaking the Tasklist Agent label', () => {
        const result = normalizeKnownRuntimeError(new Error("Can't reach database server"))

        expect(result).toEqual(
            expect.objectContaining({
                code: 'RUNTIME_INVARIANT_FAILED',
                retryable: true,
            })
        )
        expect(result?.message).toContain('数据服务暂时不可用')
        expect(result?.message).not.toContain('Tasklist Agent')
    })

    it('keeps Tasklist-specific guidance for an AgentRun schema failure', () => {
        const result = normalizeKnownRuntimeError(new Error('relation "agent_runs" does not exist'))

        expect(result?.message).toContain('Tasklist Agent 数据库结构未就绪')
    })

    it('hides internal General Agent contract details from the assistant error reply', () => {
        const error = Object.assign(new Error('Agent 未产生内部终态。'), { code: 'AGENT_CONTRACT_VIOLATION' })
        const result = normalizeKnownRuntimeError(error)

        expect(result).toEqual({
            code: 'RUNTIME_INVARIANT_FAILED',
            message: '本次回答未能完成，请稍后重试。',
            retryable: true,
        })
        expect(result?.message).not.toContain('内部终态')
    })
})
