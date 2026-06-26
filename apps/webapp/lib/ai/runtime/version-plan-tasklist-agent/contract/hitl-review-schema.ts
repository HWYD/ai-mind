import { z } from 'zod'

import { tasklistBlockingIssueSchema, tasklistValidationStatusSchema, tasklistWeakSectionSchema } from '@/lib/ai/tools/tasklist-structure'

import { tasklistStrategySchema } from './tasklist-strategy-schema'

export const agentReviewDecisionTypes = ['approve', 'edit', 'reject', 'respond'] as const
export type AgentReviewDecisionType = (typeof agentReviewDecisionTypes)[number]

const reviewReasonSchema = z.string().trim().min(1).max(500)
const reviewFeedbackSchema = z.string().trim().min(1).max(2_000)
const editedTasklistMarkdownSchema = z
    .string()
    .max(100_000)
    .refine(markdown => markdown.trim().length > 0, 'markdown 不能为空。')

export const strategyReviewDecisionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('approve') }).strict(),
    z.object({ type: z.literal('edit'), strategy: tasklistStrategySchema }).strict(),
    z.object({ type: z.literal('reject'), reason: reviewReasonSchema.optional() }).strict(),
    z.object({ type: z.literal('respond'), feedback: reviewFeedbackSchema }).strict(),
])

export const tasklistRevisionReviewDecisionSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('approve') }).strict(),
    z.object({ type: z.literal('edit'), markdown: editedTasklistMarkdownSchema }).strict(),
    z.object({ type: z.literal('reject'), reason: reviewReasonSchema.optional() }).strict(),
    z.object({ type: z.literal('respond'), feedback: reviewFeedbackSchema }).strict(),
])

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

export const strategyReviewInterruptPayloadSchema = z.union([strategyReviewRoundOnePayloadSchema, strategyReviewRoundTwoPayloadSchema])

export const tasklistRevisionReviewInterruptPayloadSchema = z
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

export const tasklistAgentInterruptPayloadSchema = z.union([
    strategyReviewInterruptPayloadSchema,
    tasklistRevisionReviewInterruptPayloadSchema,
])

export type StrategyReviewDecision = z.infer<typeof strategyReviewDecisionSchema>
export type StrategyReviewInterruptPayload = z.infer<typeof strategyReviewInterruptPayloadSchema>
export type TasklistRevisionReviewDecision = z.infer<typeof tasklistRevisionReviewDecisionSchema>
export type TasklistRevisionReviewInterruptPayload = z.infer<typeof tasklistRevisionReviewInterruptPayloadSchema>
export type TasklistAgentInterruptPayload = z.infer<typeof tasklistAgentInterruptPayloadSchema>
