import { streamErrorCodes, streamErrorScopes, streamErrorStages } from '@ai-mind/stream-core/protocol'
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
        type: z.literal('reasoning-start'),
        partId: z.string().min(1),
    }),
    z.object({
        type: z.literal('reasoning-delta'),
        partId: z.string().min(1),
        delta: z.string(),
    }),
    z.object({
        type: z.literal('reasoning-end'),
        partId: z.string().min(1),
    }),
    z.object({
        type: z.literal('tool-start'),
        partId: z.string().min(1),
        toolName: z.string().min(1),
        title: z.string().min(1).optional(),
        action: z.string().min(1).optional(),
        source: z.enum(['internal', 'mcp']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string(),
    }),
    z.object({
        type: z.literal('tool-end'),
        partId: z.string().min(1),
        toolName: z.string().min(1),
        title: z.string().min(1).optional(),
        action: z.string().min(1).optional(),
        source: z.enum(['internal', 'mcp']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string(),
        output: z.string(),
    }),
    z.object({
        type: z.literal('resource-start'),
        partId: z.string().min(1),
        resourceName: z.string().min(1),
        uri: z.string().min(1),
        serverId: z.string().min(1),
    }),
    z.object({
        type: z.literal('resource-end'),
        partId: z.string().min(1),
        resourceName: z.string().min(1),
        uri: z.string().min(1),
        serverId: z.string().min(1),
        contentPreview: z.string().optional(),
        isTruncated: z.boolean().optional(),
        previewChars: z.number().int().positive().optional(),
    }),
    z.object({
        type: z.literal('finish'),
    }),
    z.object({
        type: z.literal('error'),
        scope: z.enum(streamErrorScopes),
        errorCode: z.enum(streamErrorCodes),
        retryable: z.boolean(),
        message: z.string().min(1),
        stage: z.enum(streamErrorStages).optional(),
        partId: z.string().min(1).optional(),
        toolName: z.string().min(1).optional(),
        resourceName: z.string().min(1).optional(),
        uri: z.string().min(1).optional(),
        source: z.enum(['internal', 'mcp']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string().optional(),
    }),
])
