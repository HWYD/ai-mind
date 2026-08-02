import { z } from 'zod'

const boundedString = (maximum: number) => z.string().trim().min(1).max(maximum)

export const imageAspectRatioSchema = z.enum(['square', 'landscape', 'portrait'])

export const publicImageBriefSummarySchema = z
    .object({
        aspectRatio: imageAspectRatioSchema.optional(),
        assumptions: z.array(boundedString(160)).max(8),
        avoid: z.array(boundedString(160)).max(12),
        composition: boundedString(240).optional(),
        intent: boundedString(160),
        lightingAndColor: boundedString(240).optional(),
        mustInclude: z.array(boundedString(160)).max(12),
        scene: boundedString(240).optional(),
        style: boundedString(240).optional(),
        subjects: z.array(boundedString(120)).min(1).max(8),
        visibleText: z.array(boundedString(120)).max(8).optional(),
    })
    .strict()

export const imageBriefSchema = publicImageBriefSummarySchema.extend({
    aspectRatio: imageAspectRatioSchema,
})

export const promptInspectionIssueSchema = z
    .object({
        code: z.enum(['capability_boundary', 'conflict', 'missing_constraint', 'missing_subject', 'unsupported_assumption']),
        severity: z.enum(['blocking', 'fixable', 'non_blocking']),
    })
    .strict()

export const promptInspectionSchema = z
    .object({
        issues: z.array(promptInspectionIssueSchema).max(8),
        outcome: z.enum(['block', 'pass', 'revise']),
        revisionInstruction: boundedString(500).optional(),
    })
    .strict()

export type ImageBrief = z.infer<typeof imageBriefSchema>
export type PublicImageBriefSummary = z.infer<typeof publicImageBriefSummarySchema>
export type PromptInspection = z.infer<typeof promptInspectionSchema>
