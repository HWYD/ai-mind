import { z } from 'zod'

export const validateTasklistStructureInputSchema = z.object({
    draftText: z.string().min(1).max(100_000),
    planUri: z.string().min(1),
    targetVersion: z.string().min(1).optional(),
})

export const tasklistValidationStatusSchema = z.enum(['pass', 'warning', 'fail'])

export const tasklistWeakSectionSchema = z.object({
    autoFixable: z.boolean(),
    issue: z.string(),
    section: z.string(),
    suggestion: z.string(),
})

export const tasklistBlockingIssueSchema = z.object({
    code: z.string(),
    message: z.string(),
    suggestion: z.string(),
})

export const tasklistValidationResultSchema = z.object({
    blockingIssues: z.array(tasklistBlockingIssueSchema),
    missingSections: z.array(z.string()),
    revisionHints: z.array(z.string()),
    score: z.number().min(0).max(100),
    status: tasklistValidationStatusSchema,
    weakSections: z.array(tasklistWeakSectionSchema),
})

export interface TasklistHeading {
    depth: number
    text: string
}

export interface TasklistChecklistItem {
    checked?: boolean | null
    text: string
}

export interface TasklistStepSection {
    checklistItems: TasklistChecklistItem[]
    hasVerification: boolean
    taskCount: number
    title: string
}

export interface TasklistStructure {
    checklistItems: TasklistChecklistItem[]
    hasAnyVerificationContent: boolean
    hasEngineeringVerification: boolean
    hasExecutionDisciplineSection: boolean
    hasNonGoalsSection: boolean
    hasPausePoint: boolean
    hasRisksSection: boolean
    hasSourcePlanUri: boolean
    hasTestPlanSection: boolean
    headings: TasklistHeading[]
    steps: TasklistStepSection[]
    title?: string
}

export type ValidateTasklistStructureInput = z.infer<typeof validateTasklistStructureInputSchema>
export type TasklistBlockingIssue = z.infer<typeof tasklistBlockingIssueSchema>
export type TasklistValidationResult = z.infer<typeof tasklistValidationResultSchema>
export type TasklistWeakSection = z.infer<typeof tasklistWeakSectionSchema>
