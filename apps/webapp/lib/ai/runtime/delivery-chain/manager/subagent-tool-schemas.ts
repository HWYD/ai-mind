import { z } from 'zod'

export const subagentToolIds = ['plan-subagent', 'task-subagent', 'review-subagent'] as const
export type SubagentToolId = (typeof subagentToolIds)[number]

export const runtimeArtifactKinds = ['plan', 'tasks', 'review', 'delivery_report'] as const
export type RuntimeArtifactKind = (typeof runtimeArtifactKinds)[number]

export const subagentToolIdSchema = z.enum(subagentToolIds)
export const runtimeArtifactKindSchema = z.enum(runtimeArtifactKinds)

export const agentContextBlockSchema = z.object({
    kind: z.string().trim().min(1).max(64),
    markdown: z.string().trim().min(1),
    title: z.string().trim().min(1).max(120),
})

export type AgentContextBlock = z.infer<typeof agentContextBlockSchema>

export const runtimeArtifactSchema = z.object({
    id: z.string().trim().min(1),
    kind: runtimeArtifactKindSchema,
    markdown: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    source: z.object({
        stage: z.string().trim().min(1).optional(),
        subagentId: subagentToolIdSchema.optional(),
    }),
    title: z.string().trim().min(1).max(200),
})

export type RuntimeArtifact = z.infer<typeof runtimeArtifactSchema>

export const subagentToolCallInputSchema = z.object({
    invocationId: z.string().trim().min(1).max(120),
})

export type SubagentToolCallInput = z.infer<typeof subagentToolCallInputSchema>

export const subagentToolInputSchema = z.object({
    constraints: z.array(z.string().trim().min(1)),
    contextBlocks: z.array(agentContextBlockSchema),
    inputArtifacts: z.array(runtimeArtifactSchema),
    instruction: z.string().trim().min(1),
})

export type SubagentToolInput = z.infer<typeof subagentToolInputSchema>

export const subagentToolJsonResultSchema = z
    .object({
        artifactTitle: z.string().trim().min(1).max(200).optional(),
        markdown: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(['completed', 'blocked', 'failed']),
        summaryForManager: z.string().trim().min(1).max(400),
        warnings: z.array(z.string().trim().min(1)),
    })
    .superRefine((value, context) => {
        if (value.markdown.trim().length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'markdown 不能为空。',
                path: ['markdown'],
            })
        }

        if (value.status === 'blocked' && value.artifactTitle && value.artifactTitle.trim().length === 0) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'blocked result 的 artifactTitle 不能为空字符串。',
                path: ['artifactTitle'],
            })
        }
    })

export type SubagentToolJsonResult = z.infer<typeof subagentToolJsonResultSchema>
