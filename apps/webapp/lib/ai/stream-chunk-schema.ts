import {
    agentArtifactFormats,
    agentArtifactKinds,
    streamErrorCodes,
    streamErrorScopes,
    streamErrorStages,
} from '@ai-mind/stream-core/protocol'
import { z } from 'zod'

const agentTextArtifactMetadataSchema = z.object({
    charCount: z.number().int().nonnegative().optional(),
    generatedFrom: z.string().min(1).optional(),
    revision: z.number().int().positive().optional(),
    sectionCount: z.number().int().nonnegative().optional(),
    targetVersion: z.string().min(1).optional(),
    validated: z.boolean().optional(),
})

const agentGraphExpectedStepRangeSchema = z.custom<[number, number]>(
    value => Array.isArray(value) && value.length === 2 && value.every(item => Number.isInteger(item) && item > 0)
)

const agentGraphDebugSummarySchema = z
    .object({
        checkpointMode: z.enum(['memory', 'off']),
        currentNode: z.string().min(1).optional(),
        decision: z
            .object({
                type: z.string().min(1),
            })
            .strict()
            .optional(),
        draftRevisions: z.number().int().nonnegative(),
        lastRoute: z
            .object({
                fromNodeId: z.string().min(1),
                label: z.string().min(1),
                toNodeId: z.string().min(1),
            })
            .strict()
            .optional(),
        manualReviewItemCount: z.number().int().nonnegative(),
        maxDraftRevisions: z.number().int().nonnegative(),
        maxOptionalContextReads: z.number().int().nonnegative(),
        maxSteps: z.number().int().positive(),
        optionalContext: z
            .object({
                status: z.string().min(1),
            })
            .strict()
            .optional(),
        optionalContextReads: z.number().int().nonnegative(),
        readiness: z
            .object({
                status: z.string().min(1),
            })
            .strict()
            .optional(),
        revisionEffect: z
            .object({
                finalDecision: z.string().min(1),
            })
            .strict()
            .optional(),
        runId: z.string().min(1),
        runtimeMode: z.literal('graph'),
        stepCount: z.number().int().nonnegative(),
        strategy: z
            .object({
                expectedStepRange: agentGraphExpectedStepRangeSchema,
                granularity: z.string().min(1),
            })
            .strict()
            .optional(),
        threadId: z.string().min(1),
        validationV1: z
            .object({
                score: z.number().min(0).max(100),
                status: z.string().min(1),
            })
            .strict()
            .optional(),
        validationV2: z
            .object({
                score: z.number().min(0).max(100),
                status: z.string().min(1),
            })
            .strict()
            .optional(),
        visitedNodes: z.array(z.string().min(1)),
        warningDisposition: z
            .object({
                fixNowCount: z.number().int().nonnegative(),
                manualReviewItemCount: z.number().int().nonnegative(),
            })
            .strict()
            .optional(),
    })
    .strict()

export const chatStreamChunkSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('start'),
        messageId: z.string().min(1),
    }),
    z.object({
        type: z.literal('skill-selected'),
        skillId: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1).optional(),
    }),
    z.object({
        type: z.literal('agent-graph-node-start'),
        partId: z.string().min(1),
        runId: z.string().min(1),
        threadId: z.string().min(1),
        agentName: z.string().min(1),
        nodeId: z.string().min(1),
        title: z.string().min(1),
        stepIndex: z.number().int().positive(),
    }),
    z.object({
        type: z.literal('agent-graph-node-end'),
        partId: z.string().min(1),
        runId: z.string().min(1),
        threadId: z.string().min(1),
        agentName: z.string().min(1),
        nodeId: z.string().min(1),
        status: z.enum(['completed', 'failed', 'skipped']),
        summary: z.string().optional(),
        durationMs: z.number().int().nonnegative().optional(),
        severity: z.enum(['error', 'info', 'warning']).optional(),
        tags: z.array(z.string().min(1)).optional(),
        error: z.string().optional(),
    }),
    z.object({
        type: z.literal('agent-graph-route'),
        partId: z.string().min(1),
        runId: z.string().min(1),
        threadId: z.string().min(1),
        agentName: z.string().min(1),
        fromNodeId: z.string().min(1),
        toNodeId: z.string().min(1),
        routeLabel: z.string().min(1),
        reason: z.string().optional(),
    }),
    z.object({
        type: z.literal('agent-graph-state-patch'),
        partId: z.string().min(1),
        runId: z.string().min(1),
        threadId: z.string().min(1),
        agentName: z.string().min(1),
        nodeId: z.string().min(1),
        patchSummary: z.string(),
    }),
    z
        .object({
            type: z.literal('agent-graph-debug-summary'),
            partId: z.string().min(1),
            runId: z.string().min(1),
            threadId: z.string().min(1),
            agentName: z.string().min(1),
            summary: agentGraphDebugSummarySchema,
        })
        .strict(),
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
        type: z.literal('artifact-start'),
        artifactId: z.string().min(1),
        artifactType: z.literal('text'),
        artifactKind: z.enum(agentArtifactKinds),
        title: z.string().min(1),
        format: z.enum(agentArtifactFormats),
        sourceStepId: z.string().min(1).optional(),
        metadata: agentTextArtifactMetadataSchema.optional(),
    }),
    z.object({
        type: z.literal('artifact-delta'),
        artifactId: z.string().min(1),
        delta: z.string(),
    }),
    z.object({
        type: z.literal('artifact-end'),
        artifactId: z.string().min(1),
        status: z.enum(['completed', 'failed']),
        metadata: agentTextArtifactMetadataSchema.optional(),
        error: z.string().optional(),
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
        location: z.enum(['local', 'remote']).optional(),
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
        location: z.enum(['local', 'remote']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string(),
        output: z.string(),
    }),
    z.object({
        type: z.literal('prompt-start'),
        partId: z.string().min(1),
        promptName: z.string().min(1),
        source: z.enum(['internal', 'mcp']).optional(),
        location: z.enum(['local', 'remote']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string().optional(),
    }),
    z.object({
        type: z.literal('prompt-end'),
        partId: z.string().min(1),
        promptName: z.string().min(1),
        source: z.enum(['internal', 'mcp']).optional(),
        location: z.enum(['local', 'remote']).optional(),
        serverId: z.string().min(1).optional(),
        status: z.enum(['completed', 'failed']),
        messageCount: z.number().int().nonnegative().optional(),
    }),
    z.object({
        type: z.literal('resource-start'),
        partId: z.string().min(1),
        resourceName: z.string().min(1),
        uri: z.string().min(1),
        source: z.enum(['internal', 'mcp']).optional(),
        location: z.enum(['local', 'remote']).optional(),
        serverId: z.string().min(1),
    }),
    z.object({
        type: z.literal('resource-end'),
        partId: z.string().min(1),
        resourceName: z.string().min(1),
        uri: z.string().min(1),
        source: z.enum(['internal', 'mcp']).optional(),
        location: z.enum(['local', 'remote']).optional(),
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
        location: z.enum(['local', 'remote']).optional(),
        serverId: z.string().min(1).optional(),
        input: z.string().optional(),
        promptName: z.string().min(1).optional(),
    }),
])
