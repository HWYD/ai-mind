import { z } from 'zod'

import {
    USER_MEMORY_MAX_TEXT_CHARS,
    USER_MEMORY_MAX_TOTAL_CHARS,
    USER_MEMORY_MIN_CONFIDENCE,
    USER_MEMORY_SCHEMA_VERSION,
    USER_MEMORY_SEMANTIC_INDEX_FIELDS,
    USER_MEMORY_SEMANTIC_INDEX_VERSION,
    USER_MEMORY_SEMANTIC_PROVIDER_KIND_REAL,
    USER_MEMORY_SEMANTIC_QUERY_MAX_CHARS,
    USER_MEMORY_SEMANTIC_SCORE_THRESHOLD,
    USER_MEMORY_SEMANTIC_TIMEOUT_MS,
    USER_MEMORY_SEMANTIC_TOP_K,
} from './runtime-config'

export const USER_MEMORY_NAMESPACE_PREFIX = ['ai-mind', 'user-memory', 'v1'] as const
export const USER_MEMORY_TAG_LIMIT = 8
export const USER_MEMORY_TAG_MAX_LENGTH = 48

export const userMemoryTypeSchema = z.enum([
    'user_preference',
    'communication_preference',
    'workflow_preference',
    'standing_instruction',
    'recurring_constraint',
    'stable_user_context',
    'project_context',
    'risk_preference',
])

export const userMemoryStatusSchema = z.enum(['active', 'inactive', 'suppressed'])
export const userMemorySourceSchema = z.enum(['eligible_completed_turn', 'pinned_decision_promotion'])
export const userMemorySourceSignalSchema = z.enum([
    'explicit_memory_intent',
    'implicit_stable_preference',
    'standing_instruction_signal',
    'forget_or_negation',
    'pinned_decision_signal',
])
export const userMemoryActionSchema = z.enum(['add', 'suppress'])
export const userMemoryPathSchema = z.enum(['ordinary_chat', 'tool_assisted_ordinary_chat'])
export const userMemoryStabilitySchema = z.enum(['stable', 'temporary', 'speculative'])
export const userMemoryIdentityPolaritySchema = z.enum(['prefer', 'avoid'])
export const userMemorySemanticProviderKindSchema = z.literal(USER_MEMORY_SEMANTIC_PROVIDER_KIND_REAL)
export const userMemorySemanticIndexFieldSchema = z.enum(USER_MEMORY_SEMANTIC_INDEX_FIELDS)
export const userMemoryIdentitySchema = z
    .object({
        facet: z.string().trim().min(1).max(80).optional(),
        polarity: userMemoryIdentityPolaritySchema.optional(),
        subject: z.string().trim().min(1).max(80),
    })
    .strict()
export const userMemorySemanticMetadataSchema = z
    .object({
        embeddingDimensions: z.number().int().positive().optional(),
        embeddingModelId: z.string().trim().min(1).max(120),
        embeddingProviderKind: userMemorySemanticProviderKindSchema,
        semanticIndexFields: z.array(userMemorySemanticIndexFieldSchema).min(1).max(USER_MEMORY_SEMANTIC_INDEX_FIELDS.length),
        semanticIndexedAt: z.string().min(1),
        semanticIndexVersion: z.string().trim().min(1).max(80),
    })
    .strict()

export const userMemoryDocumentSchema = z
    .object({
        schemaVersion: z.literal(USER_MEMORY_SCHEMA_VERSION),
        stableKey: z.string().trim().min(1).max(160),
        type: userMemoryTypeSchema,
        text: z.string().trim().min(1).max(USER_MEMORY_MAX_TEXT_CHARS),
        identity: userMemoryIdentitySchema,
        tags: z.array(z.string().trim().min(1).max(USER_MEMORY_TAG_MAX_LENGTH)).max(USER_MEMORY_TAG_LIMIT),
        confidence: z.number().min(USER_MEMORY_MIN_CONFIDENCE).max(1),
        status: userMemoryStatusSchema,
        source: userMemorySourceSchema,
        sourceSignal: userMemorySourceSignalSchema.optional(),
        sourceConversationId: z.string().trim().min(1).max(120),
        sourcePinnedDecisionHash: z.string().trim().min(1).max(160).optional(),
        createdAt: z.string().min(1),
        updatedAt: z.string().min(1),
        lastUsedAt: z.string().min(1).optional(),
        semantic: userMemorySemanticMetadataSchema.optional(),
        suppressedAt: z.string().min(1).optional(),
        suppressedByConversationId: z.string().trim().min(1).max(120).optional(),
        reason: z.string().trim().min(1).max(200).optional(),
    })
    .strict()

export const userMemoryCandidateSchema = z
    .object({
        type: userMemoryTypeSchema,
        text: z.string().trim().min(1).max(USER_MEMORY_MAX_TEXT_CHARS),
        identity: userMemoryIdentitySchema,
        tags: z.array(z.string()).max(USER_MEMORY_TAG_LIMIT).default([]),
        confidence: z.number().min(0).max(1),
        stability: userMemoryStabilitySchema,
        source: userMemorySourceSchema,
        sourceConversationId: z.string().trim().min(1).max(120),
        sourceText: z.string().trim().min(1).max(2000),
        action: userMemoryActionSchema,
        sourceSignal: userMemorySourceSignalSchema.optional(),
        reason: z.string().trim().min(1).max(200).optional(),
        conflictSignal: z.boolean().optional(),
    })
    .strict()

export const selectedUserMemorySchema = z
    .object({
        stableKey: z.string().trim().min(1).max(160),
        type: userMemoryTypeSchema,
        text: z.string().trim().min(1).max(USER_MEMORY_MAX_TEXT_CHARS),
        tags: z.array(z.string().trim().min(1).max(USER_MEMORY_TAG_MAX_LENGTH)).max(USER_MEMORY_TAG_LIMIT),
        score: z.number().min(USER_MEMORY_SEMANTIC_SCORE_THRESHOLD).max(1),
    })
    .strict()

export const userMemorySemanticRetrievalRequestSchema = z
    .object({
        latestUserText: z
            .string()
            .trim()
            .min(1)
            .max(USER_MEMORY_SEMANTIC_QUERY_MAX_CHARS * 4),
        limit: z.number().int().positive().max(USER_MEMORY_SEMANTIC_TOP_K).default(USER_MEMORY_SEMANTIC_TOP_K),
        path: userMemoryPathSchema.default('ordinary_chat'),
        sessionId: z.string().trim().min(1),
        timeoutMs: z.number().int().positive().default(USER_MEMORY_SEMANTIC_TIMEOUT_MS),
    })
    .strict()

export const userMemorySemanticSearchItemSchema = z
    .object({
        document: userMemoryDocumentSchema,
        key: z.string().trim().min(1).max(160),
        namespace: z.array(z.string()).min(1),
        score: z.number().min(0).max(1).optional(),
    })
    .strict()

export const userMemorySemanticCandidateSchema = z
    .object({
        document: userMemoryDocumentSchema,
        score: z.number().min(0).max(1),
        stableKey: z.string().trim().min(1).max(160),
    })
    .strict()

export const userMemorySafeShortTermContextSchema = z
    .object({
        summary: z.string().trim().max(USER_MEMORY_MAX_TOTAL_CHARS).optional(),
        pinnedDecisions: z.array(z.string().trim().min(1).max(USER_MEMORY_MAX_TEXT_CHARS)).max(5).optional(),
    })
    .strict()

export const userMemoryExtractionJobSchema = z
    .object({
        sessionId: z.string().trim().min(1),
        sourceConversationId: z.string().trim().min(1).max(120),
        latestUserText: z.string().trim().min(1).max(2000),
        assistantFinalText: z.string().trim().min(1).max(2000),
        path: userMemoryPathSchema,
        safeShortTermContext: userMemorySafeShortTermContextSchema.optional(),
    })
    .strict()

export type UserMemoryType = z.infer<typeof userMemoryTypeSchema>
export type UserMemoryStatus = z.infer<typeof userMemoryStatusSchema>
export type UserMemorySource = z.infer<typeof userMemorySourceSchema>
export type UserMemorySourceSignal = z.infer<typeof userMemorySourceSignalSchema>
export type UserMemoryAction = z.infer<typeof userMemoryActionSchema>
export type UserMemoryPath = z.infer<typeof userMemoryPathSchema>
export type UserMemoryStability = z.infer<typeof userMemoryStabilitySchema>
export type UserMemoryIdentityPolarity = z.infer<typeof userMemoryIdentityPolaritySchema>
export type UserMemorySemanticProviderKind = z.infer<typeof userMemorySemanticProviderKindSchema>
export type UserMemorySemanticIndexField = z.infer<typeof userMemorySemanticIndexFieldSchema>
export type UserMemoryIdentity = z.infer<typeof userMemoryIdentitySchema>
export type UserMemorySemanticMetadata = z.infer<typeof userMemorySemanticMetadataSchema>
export type UserMemoryDocument = z.infer<typeof userMemoryDocumentSchema>
export type UserMemoryCandidate = z.infer<typeof userMemoryCandidateSchema>
export type SelectedUserMemory = z.infer<typeof selectedUserMemorySchema>
export type UserMemorySemanticRetrievalRequest = z.infer<typeof userMemorySemanticRetrievalRequestSchema>
export type UserMemorySemanticSearchItem = z.infer<typeof userMemorySemanticSearchItemSchema>
export type UserMemorySemanticCandidate = z.infer<typeof userMemorySemanticCandidateSchema>
export type UserMemorySafeShortTermContext = z.infer<typeof userMemorySafeShortTermContextSchema>
export type UserMemoryExtractionJob = z.infer<typeof userMemoryExtractionJobSchema>

export type UserMemoryRejectionReason =
    | 'duplicate'
    | 'empty'
    | 'full_transcript'
    | 'irrelevant'
    | 'low_confidence'
    | 'raw_runtime_state'
    | 'sensitive_personal_information'
    | 'speculative'
    | 'temporary'
    | 'too_long'
    | 'unsafe'
    | 'unsupported_type'

export type UserMemoryExtractionResult =
    | { status: 'processed'; candidates: number; written: number; updated: number; suppressed: number; rejected: number }
    | { status: 'skipped'; reason: 'empty-turn' | 'ineligible-path' | 'missing-session' | 'missing-source-conversation' }
    | { status: 'failed'; reason: 'extractor-unavailable' | 'store-unavailable' | 'unsafe-error' }

export type UserMemoryWriteResult =
    | { status: 'written'; stableKey: string }
    | { status: 'updated'; stableKey: string }
    | { status: 'suppressed'; stableKey: string }
    | { status: 'rejected'; reason: UserMemoryRejectionReason }
    | { status: 'skipped'; reason: 'missing-session' | 'missing-source-conversation' | 'store-unavailable' }

export type UserMemoryPromotionResult =
    | { status: 'processed'; candidates: number; written: number; updated: number; suppressed: number; rejected: number }
    | { status: 'skipped'; reason: 'missing-session' | 'missing-source-conversation' | 'no-diff' }
    | { status: 'failed'; reason: 'store-unavailable' | 'unsafe-error' }

export function normalizeUserMemoryDocument(value: unknown): UserMemoryDocument | null {
    const result = userMemoryDocumentSchema.safeParse(value)

    return result.success ? result.data : null
}
