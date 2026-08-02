import { z } from 'zod'

export const conversationIdSchema = z.string().trim().min(1).max(120)

export const textPartSchema = z.object({
    type: z.literal('text'),
    text: z.string().min(1),
    format: z.literal('markdown'),
})

export const reasoningPartSchema = z.object({
    type: z.literal('reasoning'),
    text: z.string().min(1),
    format: z.literal('markdown'),
    visibility: z.enum(['collapsed', 'expanded', 'hidden']).optional(),
})

export const messageInputSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(z.union([textPartSchema, reasoningPartSchema])).min(1),
})

export const composerCommandSchema = z.object({
    name: z.enum(['check', 'delivery-chain', 'image', 'summary', 'tasklist']),
    label: z.string().min(1),
})

export const composerReferenceSchema = z.object({
    id: z.string().min(1),
    type: z.literal('resource'),
    label: z.string().min(1),
    uri: z.string().min(1),
    source: z.enum(['local', 'remote']),
    serverId: z.string().min(1).optional(),
})

export const composerPayloadSchema = z.object({
    plainText: z.string(),
    command: composerCommandSchema.optional(),
    references: z.array(composerReferenceSchema).max(1).optional(),
})

const chatRequestBaseSchema = z
    .object({
        composer: composerPayloadSchema.optional(),
        messages: z.array(messageInputSchema).min(1),
        options: z
            .object({
                skill: z.string().min(1).optional(),
                modelId: z.string().optional(),
                temperature: z.number().optional(),
                maxTokens: z.number().int().positive().optional(),
                enableReasoning: z.boolean().optional(),
            })
            .strict()
            .optional(),
    })
    .strict()

export const persistedChatRequestSchema = chatRequestBaseSchema.extend({
    conversationId: conversationIdSchema,
})

export const draftCreateChatRequestSchema = chatRequestBaseSchema.extend({
    createConversation: z.literal(true),
})

export const chatRequestSchema = z.union([persistedChatRequestSchema, draftCreateChatRequestSchema])

export type ImageCommandParseResult =
    | { description: string; kind: 'accepted' }
    | { kind: 'not-image' }
    | { kind: 'rejected'; reason: 'empty' | 'oversize' | 'unsupported' }

const unicodeWhitespace = /^[\s\p{Z}]+|[\s\p{Z}]+$/gu
const imageCommandPrefix = /^\s*\/image(?=\s|$)/u
const unsupportedImageCapability =
    /\b(edit|inpaint|outpaint|remove\s+background|reference\s+image|multi(?:ple)?\s+(?:image|candidate)|局部重绘|扩图|去背景|参考图|多图)\b/iu

export function parseImageCommand(input: { composer?: { command?: { name?: string } }; text: string }): ImageCommandParseResult {
    const hasImageChip = input.composer?.command?.name === 'image'
    const matchedPrefix = imageCommandPrefix.exec(input.text)

    if (!hasImageChip && !matchedPrefix) {
        return { kind: 'not-image' }
    }

    const rawDescription = matchedPrefix ? input.text.slice(matchedPrefix[0].length) : input.text
    const description = rawDescription.normalize('NFC').replace(unicodeWhitespace, '')

    if (description.length === 0) {
        return { kind: 'rejected', reason: 'empty' }
    }

    if (Array.from(description).length > 2_000) {
        return { kind: 'rejected', reason: 'oversize' }
    }

    if (unsupportedImageCapability.test(description)) {
        return { kind: 'rejected', reason: 'unsupported' }
    }

    return { description, kind: 'accepted' }
}
