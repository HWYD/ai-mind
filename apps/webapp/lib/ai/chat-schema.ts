import { z } from 'zod'

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
    name: z.enum(['check', 'summary', 'tasklist']),
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

export const chatRequestSchema = z.object({
    conversationId: z.string().min(1),
    composer: composerPayloadSchema.optional(),
    messages: z.array(messageInputSchema).min(1),
    options: z
        .object({
            skill: z.string().min(1).optional(),
            model: z.string().optional(),
            temperature: z.number().optional(),
            maxTokens: z.number().int().positive().optional(),
            enableReasoning: z.boolean().optional(),
        })
        .optional(),
})
