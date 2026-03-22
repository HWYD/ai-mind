import { z } from 'zod'

export const chatStreamChunkSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('start'),
        messageId: z.string().min(1),
    }),
    z.object({
        type: z.literal('text-start'),
        partId: z.string().min(1),
    }),
    z.object({
        type: z.literal('text-delta'),
        partId: z.string().min(1),
        delta: z.string(),
    }),
    z.object({
        type: z.literal('text-end'),
        partId: z.string().min(1),
    }),
    z.object({
        type: z.literal('finish'),
    }),
    z.object({
        type: z.literal('error'),
        message: z.string().min(1),
    }),
])
