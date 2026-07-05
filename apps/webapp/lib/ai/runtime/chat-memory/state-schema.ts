import { z } from 'zod'

import type { MindMessage } from '@/lib/ai/types/message'

import { CHAT_CONVERSATION_THREAD_ID_REGEX, LEGACY_CHAT_MEMORY_THREAD_ID_REGEX } from './thread-id'

function isHydrationThreadId(threadId: string): boolean {
    return LEGACY_CHAT_MEMORY_THREAD_ID_REGEX.test(threadId) || CHAT_CONVERSATION_THREAD_ID_REGEX.test(threadId)
}

export const CHAT_MEMORY_RECENT_TURN_LIMIT = 2 // 最近完整对话轮次上限，一轮固定为 user + assistant
export const CHAT_MEMORY_RECENT_MESSAGE_LIMIT = CHAT_MEMORY_RECENT_TURN_LIMIT * 2 // 最近消息上限
export const CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT = CHAT_MEMORY_RECENT_TURN_LIMIT // 压缩后仍保留的最近完整对话轮次上限
export const CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT = CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT * 2 // 压缩后最近消息上限
export const CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT = 240 // 摘要预览上限
export const CHAT_MEMORY_SUMMARY_TARGET_LIMIT = 2500 // 摘要目标上限
export const CHAT_MEMORY_PINNED_DECISION_LIMIT = 20 // 关键决策上限
export const CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT = 300 // 单条关键决策文本上限
export const CHAT_CONVERSATION_REGISTRY_LIMIT = 10 // recent 会话注册表上限，仅统计正式 conversation
export const CHAT_CONVERSATION_TITLE_LIMIT = 80 // 会话标题上限
export const DEFAULT_CHAT_CONVERSATION_TITLE = '新会话' // 首条用户消息落库前的草稿标题占位

export const conversationIdSchema = z.string().trim().min(1).max(120)

export const chatThreadMessageSchema = z
    .object({
        id: z.string().min(1),
        role: z.enum(['user', 'assistant']),
        text: z.string().trim().min(1),
        createdAt: z.string().min(1),
    })
    .strict()

export const aiMindThreadStateSchema = z
    .object({
        messages: z.array(chatThreadMessageSchema).max(CHAT_MEMORY_RECENT_MESSAGE_LIMIT).default([]),
        summary: z.string().max(CHAT_MEMORY_SUMMARY_TARGET_LIMIT).default(''),
        pinnedDecisions: z
            .array(z.string().trim().min(1).max(CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT))
            .max(CHAT_MEMORY_PINNED_DECISION_LIMIT)
            .default([]),
        lastCompactedAt: z.string().optional(),
    })
    .strict()

export const aiMindCheckpointThreadStateSchema = z
    .object({
        messages: z.array(chatThreadMessageSchema).default([]),
        summary: z.string().max(CHAT_MEMORY_SUMMARY_TARGET_LIMIT).default(''),
        pinnedDecisions: z
            .array(z.string().trim().min(1).max(CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT))
            .max(CHAT_MEMORY_PINNED_DECISION_LIMIT)
            .default([]),
        lastCompactedAt: z.string().optional(),
    })
    .strict()

export const compactionOutputSchema = z
    .object({
        summary: z.string().max(CHAT_MEMORY_SUMMARY_TARGET_LIMIT),
        pinnedDecisions: z
            .array(z.string().trim().min(1).max(CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT))
            .max(CHAT_MEMORY_PINNED_DECISION_LIMIT),
    })
    .strict()

export const chatConversationSchema = z
    .object({
        id: conversationIdSchema,
        title: z.string().trim().min(1).max(CHAT_CONVERSATION_TITLE_LIMIT),
        createdAt: z.string().min(1),
        lastActiveAt: z.string().min(1),
        hasMessages: z.boolean(),
    })
    .strict()

export const conversationRegistryStateSchema = z
    .object({
        selectedConversationId: conversationIdSchema.nullable(),
        conversations: z.array(chatConversationSchema).max(CHAT_CONVERSATION_REGISTRY_LIMIT),
        updatedAt: z.string().min(1),
    })
    .strict()

export const conversationRegistryCheckpointStateSchema = z
    .object({
        selectedConversationId: z.string().trim().max(120).default(''),
        conversations: z.array(chatConversationSchema).default([]),
        updatedAt: z.string().default(''),
    })
    .strict()

export const conversationListItemSchema = z
    .object({
        id: conversationIdSchema,
        title: z.string().trim().min(1).max(CHAT_CONVERSATION_TITLE_LIMIT),
        createdAt: z.string().min(1),
        lastActiveAt: z.string().min(1),
        selected: z.boolean(),
        hasMessages: z.boolean(),
    })
    .strict()

export const conversationRegistryPayloadSchema = z
    .object({
        selectedConversationId: conversationIdSchema.nullable(),
        conversations: z.array(conversationListItemSchema).max(CHAT_CONVERSATION_REGISTRY_LIMIT),
        limit: z.literal(CHAT_CONVERSATION_REGISTRY_LIMIT),
    })
    .strict()

export const threadHydrationDtoSchema = z
    .object({
        conversationId: conversationIdSchema.optional(),
        threadId: z
            .string()
            .refine(isHydrationThreadId, 'Hydration DTO only accepts legacy or conversation-scoped chat thread ids.')
            .optional(),
        messages: z.array(z.custom<MindMessage>()),
        summaryPreview: z.string().max(CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT).optional(),
        pinnedDecisions: z.array(z.string().max(CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT)).max(CHAT_MEMORY_PINNED_DECISION_LIMIT),
        restored: z.boolean(),
    })
    .strict()

export type ChatThreadMessage = z.infer<typeof chatThreadMessageSchema>
export type AiMindThreadState = z.infer<typeof aiMindThreadStateSchema>
export type CompactionOutput = z.infer<typeof compactionOutputSchema>
export type ChatConversation = z.infer<typeof chatConversationSchema>
export type ConversationRegistryState = z.infer<typeof conversationRegistryStateSchema>
export type ConversationRegistryCheckpointState = z.infer<typeof conversationRegistryCheckpointStateSchema>
export type ConversationListItem = z.infer<typeof conversationListItemSchema>
export type ConversationRegistryPayload = z.infer<typeof conversationRegistryPayloadSchema>
export type ThreadHydrationDTO = z.infer<typeof threadHydrationDtoSchema>

export function createEmptyThreadState(): AiMindThreadState {
    return {
        messages: [],
        pinnedDecisions: [],
        summary: '',
    }
}

export function createEmptyConversationRegistryCheckpointState(): ConversationRegistryCheckpointState {
    return {
        selectedConversationId: '',
        conversations: [],
        updatedAt: '',
    }
}

export function normalizeThreadState(value: unknown): AiMindThreadState {
    return aiMindThreadStateSchema.parse(value ?? createEmptyThreadState())
}

export function normalizeCheckpointThreadState(value: unknown): AiMindThreadState & { messages: ChatThreadMessage[] } {
    return aiMindCheckpointThreadStateSchema.parse(value ?? createEmptyThreadState())
}

export function normalizeConversationRegistryState(value: unknown): ConversationRegistryState {
    return conversationRegistryStateSchema.parse(value)
}

export function normalizeConversationRegistryCheckpointState(value: unknown): ConversationRegistryCheckpointState {
    return conversationRegistryCheckpointStateSchema.parse(value ?? createEmptyConversationRegistryCheckpointState())
}
