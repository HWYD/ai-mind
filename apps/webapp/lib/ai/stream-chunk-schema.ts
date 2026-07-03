import {
    agentArtifactFormats,
    agentArtifactKinds,
    streamErrorCodes,
    streamErrorScopes,
    streamErrorStages,
} from '@ai-mind/stream-core/protocol'
import { z } from 'zod'

import { tasklistStrategySchema } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/tasklist-strategy-schema'
import {
    tasklistBlockingIssueSchema,
    tasklistValidationStatusSchema,
    tasklistWeakSectionSchema,
} from '@/lib/ai/tools/tasklist-structure/tasklist-structure-types'

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
        checkpointMode: z.enum(['memory', 'off', 'postgres']),
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
        maxStrategyRegenerations: z.number().int().nonnegative().optional(),
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
        strategyRegenerations: z.number().int().nonnegative().optional(),
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
        validationV3: z
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

const strategyReviewRoundOnePayloadSchema = z
    .object({
        allowedDecisions: z.tuple([z.literal('approve'), z.literal('edit'), z.literal('reject'), z.literal('respond')]),
        data: z
            .object({
                planUri: z.string().trim().min(1),
                reviewRound: z.literal(1),
                strategy: tasklistStrategySchema,
                targetVersion: z.string().trim().min(1).optional(),
            })
            .strict(),
        kind: z.literal('strategy_review'),
        nodeName: z.literal('reviewTasklistStrategy'),
        runId: z.string().trim().min(1),
        threadId: z.string().trim().min(1),
    })
    .strict()

const strategyReviewRoundTwoPayloadSchema = z
    .object({
        allowedDecisions: z.tuple([z.literal('approve'), z.literal('edit'), z.literal('reject')]),
        data: z
            .object({
                planUri: z.string().trim().min(1),
                reviewRound: z.literal(2),
                strategy: tasklistStrategySchema,
                targetVersion: z.string().trim().min(1).optional(),
            })
            .strict(),
        kind: z.literal('strategy_review'),
        nodeName: z.literal('reviewTasklistStrategy'),
        runId: z.string().trim().min(1),
        threadId: z.string().trim().min(1),
    })
    .strict()

const strategyReviewInterruptPayloadSchema = z.union([strategyReviewRoundOnePayloadSchema, strategyReviewRoundTwoPayloadSchema])

const tasklistRevisionReviewInterruptPayloadSchema = z
    .object({
        allowedDecisions: z.tuple([z.literal('approve'), z.literal('edit'), z.literal('reject'), z.literal('respond')]),
        data: z
            .object({
                fixNow: z.array(z.string().trim().min(1)).min(1).max(20),
                markdown: z.string().min(1).max(100_000),
                reviewRound: z.literal(1),
                revision: z.literal(1),
                validation: z
                    .object({
                        blockingIssues: z.array(tasklistBlockingIssueSchema.strict()).max(50),
                        score: z.number().min(0).max(100),
                        status: tasklistValidationStatusSchema,
                        weakSections: z.array(tasklistWeakSectionSchema.strict()).max(50),
                    })
                    .strict(),
            })
            .strict(),
        kind: z.literal('tasklist_revision_review'),
        nodeName: z.literal('reviewTasklistRevision'),
        runId: z.string().trim().min(1),
        threadId: z.string().trim().min(1),
    })
    .strict()

const tasklistAgentInterruptPayloadSchema = z.union([strategyReviewInterruptPayloadSchema, tasklistRevisionReviewInterruptPayloadSchema])

const agentInterruptChunkSchema = z
    .object({
        type: z.literal('agent-interrupt'),
        agentName: z.string().min(1),
        assistantMessageId: z.string().min(1),
        interruptId: z.string().min(1),
        interruptKind: z.enum(['strategy_review', 'tasklist_revision_review']),
        payload: tasklistAgentInterruptPayloadSchema,
        runId: z.string().min(1),
        threadId: z.string().min(1),
    })
    .strict()
    .superRefine((chunk, context) => {
        if (chunk.payload.kind !== chunk.interruptKind) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'interruptKind must match payload.kind.',
                path: ['payload', 'kind'],
            })
        }

        if (chunk.payload.runId !== chunk.runId) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'runId must match payload.runId.',
                path: ['payload', 'runId'],
            })
        }

        if (chunk.payload.threadId !== chunk.threadId) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'threadId must match payload.threadId.',
                path: ['payload', 'threadId'],
            })
        }
    })

const agentResumeChunkSchema = z
    .object({
        type: z.literal('agent-resume'),
        agentName: z.string().min(1),
        assistantMessageId: z.string().min(1),
        interruptId: z.string().min(1),
        runId: z.string().min(1),
        threadId: z.string().min(1),
    })
    .strict()

const baseChatStreamChunkSchema = z.discriminatedUnion('type', [
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
    z
        .object({
            type: z.literal('thread-memory-status'),
            status: z.enum(['started', 'succeeded', 'failed']),
            message: z.string().min(1),
            summaryLength: z.number().int().nonnegative().optional(),
            pinnedDecisionCount: z.number().int().nonnegative().optional(),
        })
        .strict(),
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
        status: z.enum(['completed', 'failed', 'paused', 'skipped']),
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
    z
        .object({
            type: z.literal('workflow-progress-start'),
            partId: z.string().min(1),
            workflowId: z.string().min(1),
            workflowKind: z.string().min(1),
            title: z.string().min(1),
            summary: z.string().min(1).optional(),
            startedAt: z.number().int().nonnegative().optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal('workflow-progress-step'),
            partId: z.string().min(1),
            workflowId: z.string().min(1),
            stepId: z.string().min(1),
            title: z.string().min(1),
            status: z.enum(['running', 'completed', 'failed']),
            summary: z.string().min(1).optional(),
            details: z.array(z.string().min(1)).max(8).optional(),
            startedAt: z.number().int().nonnegative().optional(),
            endedAt: z.number().int().nonnegative().optional(),
            durationMs: z.number().int().nonnegative().optional(),
            failureMessage: z.string().min(1).optional(),
        })
        .strict(),
    z
        .object({
            type: z.literal('workflow-progress-end'),
            partId: z.string().min(1),
            workflowId: z.string().min(1),
            status: z.enum(['completed', 'failed']),
            summary: z.string().min(1).optional(),
            endedAt: z.number().int().nonnegative().optional(),
            durationMs: z.number().int().nonnegative().optional(),
            failureMessage: z.string().min(1).optional(),
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

export const chatStreamChunkSchema = z.union([baseChatStreamChunkSchema, agentInterruptChunkSchema, agentResumeChunkSchema])
