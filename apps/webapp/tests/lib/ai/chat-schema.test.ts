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

describe('chatRequestSchema', () => {
    it('accepts the explicit draft-promotion path without conversationId', () => {
        const result = chatRequestSchema.parse({
            createConversation: true,
            messages: createValidChatRequest().messages,
        })

        expect('createConversation' in result && result.createConversation).toBe(true)
    })

    it('requires either a non-empty conversationId or createConversation=true', () => {
        expect(() => chatRequestSchema.parse({ messages: createValidChatRequest().messages })).toThrow()

        expect(() =>
            chatRequestSchema.parse(
                createValidChatRequest({
                    conversationId: '   ',
                })
            )
        ).toThrow()
    })

    it('rejects conflicting createConversation and conversationId parameters', () => {
        expect(() =>
            chatRequestSchema.parse({
                ...createValidChatRequest(),
                createConversation: true,
            })
        ).toThrow()
    })

    it('trims conversationId before passing validation', () => {
        const result = chatRequestSchema.parse(
            createValidChatRequest({
                conversationId: '  conv-trimmed  ',
            })
        )

        expect('conversationId' in result && result.conversationId).toBe('conv-trimmed')
    })

    it('accepts options.modelId', () => {
        const result = chatRequestSchema.parse(
            createValidChatRequest({
                options: {
                    modelId: 'ollama/qwen3-8b',
                },
            })
        )

        expect(result.options?.modelId).toBe('ollama/qwen3-8b')
    })

    it('rejects the old options.model field', () => {
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

    it('allows requests without options', () => {
        const result = chatRequestSchema.parse(createValidChatRequest())

        expect(result.options).toBeUndefined()
    })
})
