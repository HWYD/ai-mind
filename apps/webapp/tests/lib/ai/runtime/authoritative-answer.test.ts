import { type ToolCall, ToolMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { createAuthoritativeToolAnswer, shouldBypassAuthoritativeAnswer } from '@/lib/ai/runtime/authoritative-answer'

function createRequest(text: string) {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        type: 'text' as const,
                        format: 'markdown' as const,
                        text,
                    },
                ],
            },
        ],
        options: {},
    }
}

function createExecutedToolResult(toolName: string, output = '2', success = true) {
    return {
        toolCall: {
            id: 'tool-call-1',
            name: toolName,
            args: { expression: '1+1' },
            type: 'tool_call',
        } as ToolCall,
        toolMessage: new ToolMessage({
            content: output,
            tool_call_id: 'tool-call-1',
            status: success ? 'success' : 'error',
        }),
        output,
        success,
    }
}

describe('runtime/authoritative-answer', () => {
    it('single deterministic request can bypass model rewrite', () => {
        expect(
            shouldBypassAuthoritativeAnswer({
                request: createRequest('1+1=?'),
                executedToolResults: [createExecutedToolResult('calculator')],
            })
        ).toBe(true)
    })

    it('mixed request should not bypass model rewrite', () => {
        expect(
            shouldBypassAuthoritativeAnswer({
                request: createRequest('\u0031+\u0032+\u0033=\uff1f \u5982\u4f55\u5b66\u4e60\u6570\u5b66\uff1f'),
                executedToolResults: [createExecutedToolResult('calculator', '6')],
            })
        ).toBe(false)
    })

    it('open-ended request should not bypass model rewrite', () => {
        expect(
            shouldBypassAuthoritativeAnswer({
                request: createRequest('\u5982\u4f55\u5b66\u4e60\u6570\u5b66\uff1f'),
                executedToolResults: [createExecutedToolResult('calculator')],
            })
        ).toBe(false)
    })

    it('single authoritative tool result returns direct answer', () => {
        const answer = createAuthoritativeToolAnswer([createExecutedToolResult('calculator')], () => '1+1')

        expect(answer).toBe('`1+1` \u7684\u7ed3\u679c\u662f **2**\u3002')
    })

    it('multiple tool results do not return direct answer', () => {
        const answer = createAuthoritativeToolAnswer(
            [createExecutedToolResult('calculator'), createExecutedToolResult('unit-convert', '1 m = 100 cm')],
            () => 'input'
        )

        expect(answer).toBeNull()
    })

    it('failed tool result does not return direct answer', () => {
        const answer = createAuthoritativeToolAnswer(
            [createExecutedToolResult('calculator', '\u8ba1\u7b97\u5931\u8d25', false)],
            () => '1+1'
        )

        expect(answer).toBeNull()
    })
})
