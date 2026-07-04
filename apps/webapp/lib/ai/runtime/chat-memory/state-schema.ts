import { z } from 'zod'

import type { MindMessage } from '@/lib/ai/types/message'

export const CHAT_MEMORY_RECENT_TURN_LIMIT = 2 // 最近完整对话轮次上限，一轮固定为 user + assistant
export const CHAT_MEMORY_RECENT_MESSAGE_LIMIT = CHAT_MEMORY_RECENT_TURN_LIMIT * 2 // 最近消息上限
export const CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT = CHAT_MEMORY_RECENT_TURN_LIMIT // 压缩后保留的完整对话轮次上限
export const CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT = CHAT_MEMORY_POST_COMPACTION_RECENT_TURN_LIMIT * 2 // 压缩后最近消息上限
export const CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT = 240 // 摘要预览上限
export const CHAT_MEMORY_SUMMARY_TARGET_LIMIT = 2500 // 摘要目标上限
export const CHAT_MEMORY_PINNED_DECISION_LIMIT = 20 //关键决策上限
export const CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT = 300 //关键决策文本上限

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

export const threadHydrationDtoSchema = z
    .object({
        threadId: z.string().regex(/^chat:[a-f0-9]{64}$/),
        messages: z.array(z.custom<MindMessage>()),
        summaryPreview: z.string().max(CHAT_MEMORY_SUMMARY_PREVIEW_LIMIT).optional(),
        pinnedDecisions: z.array(z.string().max(CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT)).max(CHAT_MEMORY_PINNED_DECISION_LIMIT),
        restored: z.boolean(),
    })
    .strict()

export type ChatThreadMessage = z.infer<typeof chatThreadMessageSchema>
export type AiMindThreadState = z.infer<typeof aiMindThreadStateSchema>
export type CompactionOutput = z.infer<typeof compactionOutputSchema>
export type ThreadHydrationDTO = z.infer<typeof threadHydrationDtoSchema>

export function createEmptyThreadState(): AiMindThreadState {
    return {
        messages: [],
        pinnedDecisions: [],
        summary: '',
    }
}

export function normalizeThreadState(value: unknown): AiMindThreadState {
    return aiMindThreadStateSchema.parse(value ?? createEmptyThreadState())
}

export function normalizeCheckpointThreadState(value: unknown): AiMindThreadState & { messages: ChatThreadMessage[] } {
    return aiMindCheckpointThreadStateSchema.parse(value ?? createEmptyThreadState())
}
