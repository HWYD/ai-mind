import { z, ZodError, type ZodType } from 'zod'

const boundedText = (max = 1_000) => z.string().trim().min(1).max(max)
const markdownSchema = boundedText(14_000)
const boundedTextList = (maxItems = 20, maxText = 1_000) => z.array(boundedText(maxText)).min(1).max(maxItems)

function requireUnique(values: string[], context: z.RefinementCtx, path: Array<string | number>, message: string) {
    if (new Set(values).size !== values.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message, path })
    }
}

function hasDependencyCycle(nodes: Array<{ key: string; dependencies: string[] }>) {
    const nodesByKey = new Map(nodes.map(node => [node.key, node.dependencies]))
    const visiting = new Set<string>()
    const visited = new Set<string>()

    const visit = (key: string): boolean => {
        if (visiting.has(key)) return true
        if (visited.has(key)) return false

        visiting.add(key)
        for (const dependency of nodesByKey.get(key) ?? []) {
            if (visit(dependency)) return true
        }
        visiting.delete(key)
        visited.add(key)
        return false
    }

    return nodes.some(node => visit(node.key))
}

export const reviewerRoleSchema = z.enum(['general', 'risk', 'boundary'])
export type ReviewerRole = z.infer<typeof reviewerRoleSchema>

export const revisionTargetSchema = z.enum(['plan', 'tasks'])
export type RevisionTarget = z.infer<typeof revisionTargetSchema>

export const runStatusSchema = z.enum(['pass', 'clarification_required', 'needs_changes', 'needs_review', 'blocked', 'failed'])
export type RunStatus = z.infer<typeof runStatusSchema>

const reviewFocusSchema = z
    .object({
        boundary: boundedTextList(),
        general: boundedTextList(),
        risk: boundedTextList(),
    })
    .strict()

export const supervisorExecuteDecisionDraftSchema = z
    .object({
        assumptions: boundedTextList(),
        branch: z.literal('execute'),
        planningFocus: boundedTextList(),
        reviewFocus: reviewFocusSchema,
        reviewerRoles: z.array(reviewerRoleSchema).min(1).max(3),
        stageIntents: z
            .array(
                z
                    .object({
                        objective: boundedText(),
                        stage: z.enum(['plan', 'tasks', 'review']),
                    })
                    .strict()
            )
            .min(3)
            .max(3),
        taskFocus: boundedTextList(),
    })
    .strict()
    .superRefine((value, context) => {
        requireUnique(value.reviewerRoles, context, ['reviewerRoles'], 'reviewerRoles must not contain duplicates.')
        requireUnique(
            value.stageIntents.map(intent => intent.stage),
            context,
            ['stageIntents'],
            'stageIntents must declare each required stage once.'
        )
    })

export const supervisorPreDecisionDraftSchema = z.discriminatedUnion('branch', [
    supervisorExecuteDecisionDraftSchema,
    z
        .object({
            branch: z.literal('clarification_required'),
            missingInformation: boundedTextList(),
            nextStep: boundedText(),
            reason: boundedText(),
        })
        .strict(),
    z
        .object({
            boundaryEvidence: boundedTextList(),
            branch: z.literal('blocked'),
            nextStep: boundedText(),
            reason: boundedText(),
        })
        .strict(),
])

export type SupervisorPreDecisionDraft = z.infer<typeof supervisorPreDecisionDraftSchema>

export const reviewFindingDraftSchema = z
    .object({
        description: boundedText(),
        evidence: boundedTextList(10),
        findingType: z.enum(['issue', 'observation']),
        requirement: z.enum(['required', 'advisory']),
        severity: z.enum(['blocker', 'high', 'medium', 'low', 'info']),
        suggestedAction: boundedText(),
        targetArtifacts: z.array(revisionTargetSchema).min(1).max(2),
    })
    .strict()
    .superRefine((value, context) => {
        requireUnique(value.targetArtifacts, context, ['targetArtifacts'], 'targetArtifacts must not contain duplicates.')
    })

export type ReviewFindingDraft = z.infer<typeof reviewFindingDraftSchema>

export const generalReviewResultDraftSchema = z
    .object({
        disposition: z.enum(['pass', 'needs_changes', 'blocked']),
        findings: z.array(reviewFindingDraftSchema).max(40),
        markdown: markdownSchema,
        planTaskAlignment: z.enum(['aligned', 'misaligned']),
        role: z.literal('general'),
        summary: boundedText(),
    })
    .strict()

export type GeneralReviewResultDraft = z.infer<typeof generalReviewResultDraftSchema>

export const riskReviewResultDraftSchema = z
    .object({
        findings: z.array(reviewFindingDraftSchema).max(40),
        markdown: markdownSchema,
        role: z.literal('risk'),
        severity: z.enum(['blocker', 'high', 'medium', 'low', 'info']),
        summary: boundedText(),
    })
    .strict()

export type RiskReviewResultDraft = z.infer<typeof riskReviewResultDraftSchema>

export const boundaryReviewResultDraftSchema = z
    .object({
        boundaryStatus: z.enum(['passed', 'needs_review', 'blocked']),
        findings: z.array(reviewFindingDraftSchema).max(40),
        markdown: markdownSchema,
        role: z.literal('boundary'),
        summary: boundedText(),
        violations: z.array(boundedText()).max(20),
    })
    .strict()

export type BoundaryReviewResultDraft = z.infer<typeof boundaryReviewResultDraftSchema>

export const reviewResultDraftSchema = z.discriminatedUnion('role', [
    generalReviewResultDraftSchema,
    riskReviewResultDraftSchema,
    boundaryReviewResultDraftSchema,
])
export type ReviewResultDraft = z.infer<typeof reviewResultDraftSchema>

const planPhaseSchema = z
    .object({
        dependsOnPhaseKeys: z.array(boundedText(120)).max(40),
        objective: boundedText(),
        phaseKey: z.string().trim().min(1).max(120),
        requirementRefs: boundedTextList(20, 160),
        title: boundedText(200),
    })
    .strict()

export const planArtifactDraftSchema = z
    .object({
        acceptanceCriteria: z
            .array(
                z
                    .object({
                        criterionKey: z.string().trim().min(1).max(120),
                        description: boundedText(),
                        requirementRefs: boundedTextList(20, 160),
                    })
                    .strict()
            )
            .min(1)
            .max(40),
        assumptions: z.array(boundedText()).max(20),
        deliveryPhases: z.array(planPhaseSchema).min(1).max(40),
        markdown: markdownSchema,
        requirementRefs: boundedTextList(20, 160),
        scope: z
            .object({
                excluded: z.array(boundedText()).max(20),
                included: boundedTextList(),
            })
            .strict(),
        summary: boundedText(),
    })
    .strict()
    .superRefine((value, context) => {
        const phaseKeys = value.deliveryPhases.map(phase => phase.phaseKey)
        requireUnique(phaseKeys, context, ['deliveryPhases'], 'delivery phase keys must be unique.')
        requireUnique(
            value.acceptanceCriteria.map(criterion => criterion.criterionKey),
            context,
            ['acceptanceCriteria'],
            'acceptance criterion keys must be unique.'
        )

        const validPhaseKeys = new Set(phaseKeys)
        for (const [index, phase] of value.deliveryPhases.entries()) {
            for (const dependency of phase.dependsOnPhaseKeys) {
                if (!validPhaseKeys.has(dependency) || dependency === phase.phaseKey) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'A phase dependency must reference another current phase.',
                        path: ['deliveryPhases', index, 'dependsOnPhaseKeys'],
                    })
                }
            }
        }

        if (hasDependencyCycle(value.deliveryPhases.map(phase => ({ dependencies: phase.dependsOnPhaseKeys, key: phase.phaseKey })))) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Delivery phase dependencies must not contain a cycle.',
                path: ['deliveryPhases'],
            })
        }
    })

export type PlanArtifactDraft = z.infer<typeof planArtifactDraftSchema>

const taskDraftSchema = z
    .object({
        acceptanceCriteria: boundedTextList(),
        dependsOnTaskIds: z.array(z.string().trim().min(1).max(120)).max(40),
        requirementRefs: boundedTextList(20, 160),
        targetArea: boundedText(240),
        taskId: z.string().trim().min(1).max(120),
        title: boundedText(200),
    })
    .strict()

export const taskArtifactDraftSchema = z
    .object({
        markdown: markdownSchema,
        summary: boundedText(),
        tasks: z.array(taskDraftSchema).min(1).max(40),
    })
    .strict()
    .superRefine((value, context) => {
        const taskIds = value.tasks.map(task => task.taskId)
        requireUnique(taskIds, context, ['tasks'], 'task IDs must be unique.')
        const knownTaskIds = new Set(taskIds)
        for (const [index, task] of value.tasks.entries()) {
            for (const dependency of task.dependsOnTaskIds) {
                if (!knownTaskIds.has(dependency) || dependency === task.taskId) {
                    context.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'A task dependency must reference another current task.',
                        path: ['tasks', index, 'dependsOnTaskIds'],
                    })
                }
            }
        }

        if (hasDependencyCycle(value.tasks.map(task => ({ dependencies: task.dependsOnTaskIds, key: task.taskId })))) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Task dependencies must not contain a cycle.',
                path: ['tasks'],
            })
        }
    })

export type TaskArtifactDraft = z.infer<typeof taskArtifactDraftSchema>

const revisionRequestDraftSchema = z
    .object({
        requestKey: z.string().trim().min(1).max(120),
        requiredActions: boundedTextList(),
        sourceFindingIds: boundedTextList(20, 160),
        summary: boundedText(),
        targets: z.array(revisionTargetSchema).min(1).max(2),
    })
    .strict()
    .superRefine((value, context) => {
        requireUnique(value.sourceFindingIds, context, ['sourceFindingIds'], 'sourceFindingIds must not contain duplicates.')
        requireUnique(value.targets, context, ['targets'], 'targets must not contain duplicates.')
    })

export const supervisorPostReviewGuidanceDraftSchema = z
    .object({
        rationale: boundedText(),
        recommendations: z
            .array(
                z
                    .object({
                        acceptanceSuggestion: boundedText(),
                        requiredActions: boundedTextList(),
                        summary: boundedText(),
                        target: revisionTargetSchema,
                    })
                    .strict()
            )
            .min(1)
            .max(2),
    })
    .strict()
    .superRefine((value, context) => {
        requireUnique(
            value.recommendations.map(recommendation => recommendation.target),
            context,
            ['recommendations'],
            'recommendations must declare each target at most once.'
        )
    })

export type SupervisorPostReviewGuidanceDraft = z.infer<typeof supervisorPostReviewGuidanceDraftSchema>

export const supervisorPostReviewDecisionDraftSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('finalize'), rationale: boundedText() }).strict(),
    z
        .object({
            action: z.literal('revise'),
            rationale: boundedText(),
            requests: z.array(revisionRequestDraftSchema).min(1).max(20),
            revisionTargets: z.array(revisionTargetSchema).min(1).max(2),
        })
        .strict()
        .superRefine((value, context) => {
            requireUnique(value.revisionTargets, context, ['revisionTargets'], 'revisionTargets must not contain duplicates.')
            requireUnique(
                value.requests.map(request => request.requestKey),
                context,
                ['requests'],
                'revision request keys must be unique.'
            )
        }),
    z
        .object({
            action: z.literal('blocked'),
            rationale: boundedText(),
            sourceFindingIds: boundedTextList(20, 160),
        })
        .strict(),
])

export type SupervisorPostReviewDecisionDraft = z.infer<typeof supervisorPostReviewDecisionDraftSchema>

export const safeContractIssueSchema = z
    .object({
        code: z.string().trim().min(1).max(120),
        path: z.string().trim().min(1).max(160),
    })
    .strict()
export type SafeContractIssue = z.infer<typeof safeContractIssueSchema>

export const supervisorDispatchPlanSchema = z
    .object({
        dispatchPlanId: z.string().trim().min(1).max(120),
        postReviewDecision: supervisorPostReviewDecisionDraftSchema.optional(),
        preDecision: supervisorPreDecisionDraftSchema,
    })
    .strict()
    .superRefine((value, context) => {
        if (value.preDecision.branch !== 'execute' && value.postReviewDecision) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Only execute decisions may have a post-review decision.',
                path: ['postReviewDecision'],
            })
        }
    })

export type SupervisorDispatchPlan = z.infer<typeof supervisorDispatchPlanSchema>

export function collectSafeContractIssues(error: ZodError | z.ZodError): SafeContractIssue[] {
    return error.issues.slice(0, 5).map(issue => ({
        code: issue.code,
        path: issue.path.length > 0 ? issue.path.join('.') : '$',
    }))
}

export function parseAgentContract<T>(schema: ZodType<T>, value: unknown): T {
    return schema.parse(value)
}
