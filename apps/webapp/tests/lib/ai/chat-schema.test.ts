import { describe, expect, it } from 'vitest'

import { chatRequestSchema } from '@/lib/ai/chat-schema'

function createValidChatRequest(overrides: Record<string, unknown> = {}) {
    return {
        conversationId: 'conv-1',
        messages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        format: 'markdown',
                        text: '你好',
                    },
                ],
            },
        ],
        ...overrides,
    }
}

describe('chatRequestSchema options.modelId', () => {
    it('接受 options.modelId', () => {
        const result = chatRequestSchema.parse(
            createValidChatRequest({
                options: {
                    modelId: 'ollama/qwen3-8b',
                },
            })
        )

        expect(result.options?.modelId).toBe('ollama/qwen3-8b')
    })

    it('拒绝旧 options.model 字段', () => {
        expect(() =>
            chatRequestSchema.parse(
                createValidChatRequest({
                    options: {
                        model: 'qwen3:8b',
                    },
                })
            )
        ).toThrow()
    })

    it('允许不传 options', () => {
        const result = chatRequestSchema.parse(createValidChatRequest())

        expect(result.options).toBeUndefined()
    })
})
