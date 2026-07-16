import { z } from 'zod'

import type { MindMessage } from '@/lib/ai/types/message'

export const LOCAL_CHAT_SCHEMA_VERSION = 1
export const LOCAL_CHAT_RECENT_LIMIT = 10
export const LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT = 120

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

const recoverableMessageSchema: z.ZodType<MindMessage> = z
    .object({
        artifacts: z.array(z.record(z.string(), z.unknown())).optional(),
        composer: z.record(z.string(), z.unknown()).optional(),
        createdAt: z.string().datetime(),
        id: z.string().min(1),
        parts: z.array(z.record(z.string(), z.unknown())).min(1),
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

export type LocalConversationMetadata = z.infer<typeof localConversationMetadataSchema>
export type LocalConversationIndex = z.infer<typeof localConversationIndexSchema>
export type LocalConversationSnapshot = z.infer<typeof localConversationSnapshotSchema>

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
