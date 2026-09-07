import { describe, expect, it } from 'vitest'

import { isAbortError, isInvalidSkillError, throwIfAborted } from '@/lib/ai/error-utils'
import { createStreamErrorChunk } from '@/lib/ai/runtime/stream-errors'

describe('runtime/stream-errors', () => {
    it('createStreamErrorChunk 会补齐统一 error 事件结构', () => {
        const chunk = createStreamErrorChunk({
            scope: 'tool',
            errorCode: 'TOOL_EXECUTION_FAILED',
            retryable: false,
            message: '工具执行失败',
            stage: 'tool-execution',
            partId: 'part-1',
            toolName: 'calculator',
            source: 'internal',
            input: '1+1',
        })

        expect(chunk).toEqual({
            type: 'error',
            scope: 'tool',
            errorCode: 'TOOL_EXECUTION_FAILED',
            retryable: false,
            message: '工具执行失败',
            stage: 'tool-execution',
            partId: 'part-1',
            toolName: 'calculator',
            source: 'internal',
            input: '1+1',
        })
    })

    it('isAbortError 能识别 AbortError', () => {
        expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true)
        expect(isAbortError(new Error('normal error'))).toBe(false)
    })

    it('throwIfAborted 仅在 signal 已取消时抛出 AbortError', () => {
        const active = new AbortController()
        const cancelled = new AbortController()
        cancelled.abort()

        expect(() => throwIfAborted(active.signal)).not.toThrow()
        expect(() => throwIfAborted(cancelled.signal)).toThrow(expect.objectContaining({ name: 'AbortError' }))
    })

    it('isInvalidSkillError 能识别 InvalidSkillError', () => {
        const error = new Error('invalid skill')
        error.name = 'InvalidSkillError'

        expect(isInvalidSkillError(error)).toBe(true)
        expect(isInvalidSkillError(new Error('other'))).toBe(false)
    })

    it('request 级错误可不携带 stage 字段', () => {
        const chunk = createStreamErrorChunk({
            scope: 'request',
            errorCode: 'INVALID_SKILL',
            retryable: false,
            message: 'invalid skill',
        })

        expect(chunk).toEqual({
            type: 'error',
            scope: 'request',
            errorCode: 'INVALID_SKILL',
            retryable: false,
            message: 'invalid skill',
        })
    })
})
