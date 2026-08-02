import { z } from 'zod'

import { safeContractIssueSchema } from './agent-contracts'

export const subagentToolIds = ['plan-subagent', 'task-subagent', 'review-subagent', 'risk-subagent', 'boundary-subagent'] as const
export type SubagentToolId = (typeof subagentToolIds)[number]

export const runtimeArtifactKinds = ['plan', 'tasks', 'review', 'delivery_report'] as const
export type RuntimeArtifactKind = (typeof runtimeArtifactKinds)[number]

export const subagentToolIdSchema = z.enum(subagentToolIds)
export const runtimeArtifactKindSchema = z.enum(runtimeArtifactKinds)

export const runtimeArtifactSchema = z
    .object({
        artifactId: z.string().trim().min(1),
        id: z.string().trim().min(1),
        kind: runtimeArtifactKindSchema,
        markdown: z.string().trim().min(1).max(14_000),
        source: z
            .object({
                stage: z.string().trim().min(1).optional(),
                subagentId: subagentToolIdSchema.optional(),
            })
            .strict(),
        revision: z.union([z.literal(1), z.literal(2)]),
        title: z.string().trim().min(1).max(200),
    })
    .strict()

export type RuntimeArtifact = z.infer<typeof runtimeArtifactSchema>

export const subagentToolCallInputSchema = z
    .object({
        invocationId: z.string().trim().min(1).max(120),
    })
    .strict()

export type SubagentToolCallInput = z.infer<typeof subagentToolCallInputSchema>

export const deliveryWorkerToolResultSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('success'),
            value: z.unknown(),
        })
        .strict(),
    z
        .object({
            issues: z.array(safeContractIssueSchema).min(1).max(5),
            kind: z.literal('contract_failure'),
        })
        .strict(),
    z
        .object({
            failureCode: z.string().trim().min(1).max(128),
            kind: z.literal('execution_failed'),
        })
        .strict(),
    z
        .object({
            kind: z.literal('timeout'),
        })
        .strict(),
])

export type DeliveryWorkerToolResult = z.infer<typeof deliveryWorkerToolResultSchema>
