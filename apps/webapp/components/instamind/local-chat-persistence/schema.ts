import { agentArtifactFormats, agentArtifactKinds } from '@ai-mind/stream-core/protocol'
import { z } from 'zod'

import { agentGraphDebugSummarySchema } from '@/lib/ai/stream-chunk-schema'
import type { MindMessage } from '@/lib/ai/types/message'

export const LOCAL_CHAT_SCHEMA_VERSION = 2
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
        schemaVersion: z.union([z.literal(1), z.literal(LOCAL_CHAT_SCHEMA_VERSION)]),
        selectedConversationId: z.string().min(1).nullable(),
        updatedAt: z.string().datetime(),
    })
    .strict()

const publicSourceRecordSchema = z
    .object({
        originTool: z.enum(['web-search', 'read-url']),
        snippet: z.string().optional(),
        sourceId: z.string().min(1),
        status: z.enum(['discovered', 'read']),
        title: z.string().min(1),
        url: z.string().url(),
    })
    .strict()

const agentGraphNodeSchema = z
    .object({
        durationMs: z.number().int().nonnegative().optional(),
        error: z.string().optional(),
        nodeId: z.string().min(1),
        partId: z.string().min(1),
        patchSummaries: z.array(z.string()),
        severity: z.enum(['error', 'info', 'warning']).optional(),
        status: z.enum(['completed', 'failed', 'paused', 'running', 'skipped']),
        stepIndex: z.number().int().nonnegative(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        title: z.string().min(1),
    })
    .strict()

const agentGraphRouteSchema = z
    .object({
        fromNodeId: z.string().min(1),
        reason: z.string().optional(),
        routeLabel: z.string().min(1),
        toNodeId: z.string().min(1),
    })
    .strict()

export const recoverableAgentGraphPartSchema = z
    .object({
        agentName: z.string().min(1),
        graph: z
            .object({
                debugSummary: agentGraphDebugSummarySchema.optional(),
                nodes: z.array(agentGraphNodeSchema),
                routes: z.array(agentGraphRouteSchema),
                runtime: z.literal('LangGraph'),
            })
            .strict(),
        id: z.string().min(1).optional(),
        runId: z.string().min(1),
        status: z.enum(['completed', 'failed', 'paused', 'running', 'skipped']),
        type: z.literal('agent-graph'),
    })
    .strict()

export const recoverableAgentRunPartSchema = z
    .object({
        id: z.string().min(1).optional(),
        finalizationMode: z.enum(['constrained', 'normal']).optional(),
        runId: z.string().min(1),
        status: z.literal('completed'),
        type: z.literal('agent-run'),
    })
    .strict()

export const recoverableAgentTextPartSchema = z
    .object({
        format: z.literal('markdown'),
        id: z.string().min(1),
        modelTurnId: z.string().min(1),
        phase: z.enum(['commentary', 'final_answer']),
        runId: z.string().min(1),
        status: z.literal('completed'),
        text: z.string().min(1),
        type: z.literal('agent-text'),
    })
    .strict()

const recoverablePartSchema = z.discriminatedUnion('type', [
    recoverableAgentRunPartSchema,
    recoverableAgentTextPartSchema,
    recoverableAgentGraphPartSchema,
    z
        .object({
            id: z.string().min(1).optional(),
            messageCount: z.number().int().nonnegative().optional(),
            promptName: z.string().min(1),
            serverId: z.string().min(1).optional(),
            source: z.enum(['internal', 'mcp']).optional(),
            status: z.enum(['completed', 'failed']),
            type: z.literal('prompt'),
        })
        .strict(),
    z
        .object({
            id: z.string().min(1).optional(),
            location: z.enum(['local', 'remote']).optional(),
            resourceName: z.string().min(1),
            serverId: z.string().min(1),
            source: z.enum(['internal', 'mcp']).optional(),
            status: z.enum(['completed', 'failed']),
            type: z.literal('resource'),
            uri: z.string().min(1),
        })
        .strict(),
    z
        .object({
            id: z.string().min(1).optional(),
            name: z.string().min(1),
            skillId: z.string().min(1),
            type: z.literal('skill'),
        })
        .strict(),
    z
        .object({
            displaySegments: z.array(z.record(z.string(), z.unknown())).optional(),
            format: z.literal('markdown'),
            id: z.string().min(1).optional(),
            text: z.string(),
            type: z.literal('text'),
        })
        .strict(),
    z
        .object({
            action: z.string().min(1).optional(),
            id: z.string().min(1).optional(),
            location: z.enum(['local', 'remote']).optional(),
            serverId: z.string().min(1).optional(),
            sources: z.array(publicSourceRecordSchema).max(5).optional(),
            source: z.enum(['internal', 'mcp']).optional(),
            status: z.enum(['completed', 'failed']),
            title: z.string().min(1).optional(),
            toolName: z.string().min(1),
            type: z.literal('tool'),
        })
        .strict(),
    z
        .object({
            durationMs: z.number().int().nonnegative().optional(),
            endedAt: z.number().int().nonnegative().optional(),
            failureMessage: z.string().optional(),
            id: z.string().min(1).optional(),
            status: z.enum(['completed', 'failed', 'cancelled']),
            steps: z.array(z.record(z.string(), z.unknown())),
            startedAt: z.number().int().nonnegative().optional(),
            summary: z.string().optional(),
            title: z.string().min(1),
            type: z.literal('workflow-progress'),
            visibility: z.enum(['collapsed', 'expanded']),
            workflowId: z.string().min(1),
            workflowKind: z.string().min(1),
        })
        .strict(),
])

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

const recoverableArtifactMetadataSchema = z
    .object({
        charCount: z.number().int().nonnegative().optional(),
        generatedFrom: z.string().min(1).optional(),
        revision: z.number().int().positive().optional(),
        sectionCount: z.number().int().nonnegative().optional(),
        targetVersion: z.string().min(1).optional(),
        validated: z.boolean().optional(),
    })
    .strict()

const recoverableArtifactSchema = z
    .object({
        artifactId: z.string().min(1),
        artifactKind: z.enum(agentArtifactKinds),
        artifactType: z.literal('text'),
        content: z.string(),
        error: z.string().optional(),
        format: z.enum(agentArtifactFormats),
        metadata: recoverableArtifactMetadataSchema.optional(),
        status: z.enum(['completed', 'failed']),
        title: z.string().min(1),
    })
    .strict()

const recoverableMessageSchema: z.ZodType<MindMessage> = z
    .object({
        artifacts: z.array(recoverableArtifactSchema).optional(),
        createdAt: z.string().datetime(),
        id: z.string().min(1),
        parts: z.array(z.union([recoverablePartSchema, recoverableImageBriefPartSchema, recoverableImageResultPartSchema])).min(1),
        role: z.union([z.literal('user'), z.literal('assistant')]),
        status: z.literal('completed').optional(),
    })
    .strict() as unknown as z.ZodType<MindMessage>

export const localConversationSnapshotSchema = z
    .object({
        conversationId: z.string().min(1),
        createdAt: z.string().datetime(),
        lastActiveAt: z.string().datetime(),
        messages: z.array(recoverableMessageSchema),
        revision: z.number().int().nonnegative(),
        schemaVersion: z.union([z.literal(1), z.literal(LOCAL_CHAT_SCHEMA_VERSION)]),
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
