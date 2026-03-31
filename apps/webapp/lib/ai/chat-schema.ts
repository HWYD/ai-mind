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

export const chatRequestSchema = z.object({
    conversationId: z.string().min(1),
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
