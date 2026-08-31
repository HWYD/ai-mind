import { z } from 'zod'

import type { MindMessage } from '@/lib/ai/types/message'

export const LOCAL_CHAT_SCHEMA_VERSION = 1
export const LOCAL_CHAT_RECENT_LIMIT = 50
export const LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT = 120
export const LOCAL_MESSAGE_HEIGHT_HINT_MAX_ENTRIES = 2_000
export const LOCAL_MESSAGE_HEIGHT_HINT_MAX_LAYOUTS_PER_CONVERSATION = 3

export const localConversationMetadataSchema = z
    .object({
        createdAt: z.string().datetime(),
        hasMessages: z.boolean(),
        id: z.string().min(1),
        lastActiveAt: z.string().datetime(),
        title: z.string(),
    })
    .strict()

export const localConversationIndexSchema = z
    .object({
        conversations: z.array(localConversationMetadataSchema).max(LOCAL_CHAT_RECENT_LIMIT),
        isDraft: z.boolean(),
        revision: z.number().int().nonnegative(),
        schemaVersion: z.literal(LOCAL_CHAT_SCHEMA_VERSION),
        selectedConversationId: z.string().min(1).nullable(),
        updatedAt: z.string().datetime(),
    })
    .strict()

const recoverablePartSchema = z
    .object({
        type: z.enum(['agent-step', 'prompt', 'reasoning', 'resource', 'skill', 'text', 'tool', 'workflow-progress']),
    })
    .passthrough()

const recoverableImageBriefPartSchema = z
    .object({
        id: z.string().min(1),
        runId: z.string().min(1),
        summary: z
            .object({
                aspectRatio: z.enum(['square', 'landscape', 'portrait']).optional(),
                assumptions: z.array(z.string().min(1)),
                avoid: z.array(z.string().min(1)),
                composition: z.string().min(1).optional(),
                intent: z.string().min(1),
                lightingAndColor: z.string().min(1).optional(),
                mustInclude: z.array(z.string().min(1)),
                scene: z.string().min(1).optional(),
                style: z.string().min(1).optional(),
                subjects: z.array(z.string().min(1)),
                visibleText: z.array(z.string().min(1)).optional(),
            })
            .strict(),
        type: z.literal('image-brief'),
    })
    .strict()

const recoverableImageResultPartSchema = z
    .object({
        contentPath: z.string().regex(/^\/api\/chat\/runs\/[^/]+\/image$/),
        expiresAt: z.string().datetime({ offset: true }),
        height: z.number().int().positive().optional(),
        id: z.string().min(1),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).optional(),
        runId: z.string().min(1),
        suggestedFileName: z
            .string()
            .min(1)
            .max(160)
            .regex(/^[^\\/]+$/),
        temporary: z.literal(true),
        type: z.literal('image-result'),
        width: z.number().int().positive().optional(),
    })
    .strict()

const recoverableMessageSchema: z.ZodType<MindMessage> = z
    .object({
        artifacts: z.array(z.record(z.string(), z.unknown())).optional(),
        composer: z.record(z.string(), z.unknown()).optional(),
        createdAt: z.string().datetime(),
        id: z.string().min(1),
        parts: z.array(z.union([recoverablePartSchema, recoverableImageBriefPartSchema, recoverableImageResultPartSchema])).min(1),
        role: z.union([z.literal('user'), z.literal('assistant')]),
        status: z.literal('completed').optional(),
    })
    .passthrough() as unknown as z.ZodType<MindMessage>

export const localConversationSnapshotSchema = z
    .object({
        conversationId: z.string().min(1),
        createdAt: z.string().datetime(),
        lastActiveAt: z.string().datetime(),
        messages: z.array(recoverableMessageSchema),
        revision: z.number().int().nonnegative(),
        schemaVersion: z.literal(LOCAL_CHAT_SCHEMA_VERSION),
        snapshotAt: z.string().datetime(),
        title: z.string(),
    })
    .strict()

export const localMessageHeightHintEntrySchema = z
    .object({
        height: z
            .number()
            .finite()
            .positive()
            .max(8_000)
            .refine(value => Number.isInteger(value * 4), 'Height hints must be normalized to quarter CSS pixels.'),
        measuredAt: z.string().datetime(),
        messageId: z.string().min(1),
        presentation: z.literal('history-default'),
        renderFingerprint: z.string().min(1).max(160),
    })
    .strict()

export const localMessageHeightHintRecordSchema = z
    .object({
        conversationId: z.string().min(1),
        entries: z.array(localMessageHeightHintEntrySchema).max(LOCAL_MESSAGE_HEIGHT_HINT_MAX_ENTRIES),
        geometryVersion: z.number().int().positive(),
        key: z.string().min(1).max(512),
        layoutKey: z.string().min(1).max(256),
        messageColumnWidth: z.number().finite().positive().max(4_000),
        updatedAt: z.string().datetime(),
    })
    .strict()

export type LocalConversationMetadata = z.infer<typeof localConversationMetadataSchema>
export type LocalConversationIndex = z.infer<typeof localConversationIndexSchema>
export type LocalConversationSnapshot = z.infer<typeof localConversationSnapshotSchema>
export type LocalMessageHeightHintEntry = z.infer<typeof localMessageHeightHintEntrySchema>
export type LocalMessageHeightHintRecord = z.infer<typeof localMessageHeightHintRecordSchema>

export type LocalReadResult<T> =
    | {
          data: T
          status: 'valid'
      }
    | {
          status: 'missing' | 'invalid' | 'unavailable'
      }

export type LocalWriteResult =
    | {
          revision: number
          status: 'written'
      }
    | {
          status: 'stale'
      }
    | {
          status: 'quota' | 'unavailable'
      }

export function createEmptyLocalConversationIndex(now = new Date().toISOString()): LocalConversationIndex {
    return {
        conversations: [],
        isDraft: true,
        revision: 0,
        schemaVersion: LOCAL_CHAT_SCHEMA_VERSION,
        selectedConversationId: null,
        updatedAt: now,
    }
}

export function normalizeLocalConversationIndex(index: LocalConversationIndex): LocalConversationIndex {
    const uniqueConversations = new Map<string, LocalConversationMetadata>()

    for (const conversation of index.conversations) {
        uniqueConversations.set(conversation.id, conversation)
    }

    const conversations = Array.from(uniqueConversations.values())
        .sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt))
        .slice(0, LOCAL_CHAT_RECENT_LIMIT)
    const selectedConversationId = index.selectedConversationId
    const selectedExists = selectedConversationId ? conversations.some(conversation => conversation.id === selectedConversationId) : false

    return {
        ...index,
        conversations,
        isDraft: index.isDraft || !selectedExists,
        selectedConversationId: selectedExists && !index.isDraft ? selectedConversationId : null,
    }
}
