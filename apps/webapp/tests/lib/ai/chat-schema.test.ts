import { describe, expect, it } from 'vitest'

import { chatRequestSchema, parseImageCommand } from '@/lib/ai/chat-schema'
import { normalizeImageComposerSubmission } from '@/lib/ai/composer-submission'

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

    it('parses only exact /image entries with normalized bounded descriptions', () => {
        expect(parseImageCommand({ text: '  /image  cafe\u0301  ' })).toEqual({ description: 'café', kind: 'accepted' })
        expect(parseImageCommand({ text: '/imagex a lake' })).toEqual({ kind: 'not-image' })
        expect(parseImageCommand({ text: 'draw /image a lake' })).toEqual({ kind: 'not-image' })
        expect(parseImageCommand({ text: '/image   ' })).toEqual({ kind: 'rejected', reason: 'empty' })
        expect(parseImageCommand({ text: `/image ${'a'.repeat(2_001)}` })).toEqual({ kind: 'rejected', reason: 'oversize' })
        expect(parseImageCommand({ text: '/image a lake, remove background' })).toEqual({ kind: 'rejected', reason: 'unsupported' })
        expect(parseImageCommand({ composer: { command: { name: 'image' } }, text: 'a lake' })).toEqual({
            description: 'a lake',
            kind: 'accepted',
        })
    })

    it('restores image command semantics when copied /image text is pasted without a chip', () => {
        expect(normalizeImageComposerSubmission('/image 生成一张猫咪照片', undefined)).toEqual({
            composer: {
                command: { label: '生成图片', name: 'image' },
                plainText: '生成一张猫咪照片',
            },
            text: '生成一张猫咪照片',
        })
    })
})
