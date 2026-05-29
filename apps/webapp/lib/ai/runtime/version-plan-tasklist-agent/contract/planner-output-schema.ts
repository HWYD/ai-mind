import { z } from 'zod'

import {
    type PlanningDecisionAction,
    type PlanningDecisionOutput,
    type TasklistStrategy,
    VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS,
} from './types'

const PLANNING_DECISION_LIMITS = {
    maxMessageChars: 800,
    maxQuestionChars: 300,
    maxReasonChars: 500,
    maxReviewItems: 5,
    maxReviewItemDetailChars: 500,
    maxReviewItemTitleChars: 80,
} as const

const planningDecisionReasonSchema = z.string().trim().min(1).max(PLANNING_DECISION_LIMITS.maxReasonChars)
const strategyTextSchema = z.string().trim().min(1).max(120)

export const versionPlanTasklistManualReviewItemSchema = z
    .object({
        title: z.string().trim().min(1).max(PLANNING_DECISION_LIMITS.maxReviewItemTitleChars),
        detail: z.string().trim().min(1).max(PLANNING_DECISION_LIMITS.maxReviewItemDetailChars),
        severity: z.enum(['info', 'warning']),
    })
    .strict()

const proceedToTasklistStrategyActionSchema = z
    .object({
        type: z.literal('proceed_to_tasklist_strategy'),
        reason: planningDecisionReasonSchema,
    })
    .strict()

const readOptionalContextActionSchema = z
    .object({
        type: z.literal('read_optional_context'),
        resourceUri: z.enum(VERSION_PLAN_TASKLIST_OPTIONAL_CONTEXT_RESOURCE_URIS),
        reason: planningDecisionReasonSchema,
    })
    .strict()

const askClarificationActionSchema = z
    .object({
        type: z.literal('ask_clarification'),
        question: z.string().trim().min(1).max(PLANNING_DECISION_LIMITS.maxQuestionChars),
        reason: planningDecisionReasonSchema,
    })
    .strict()

const proceedWithManualReviewItemsActionSchema = z
    .object({
        type: z.literal('proceed_with_manual_review_items'),
        reviewItems: z.array(versionPlanTasklistManualReviewItemSchema).min(1).max(PLANNING_DECISION_LIMITS.maxReviewItems),
        reason: planningDecisionReasonSchema,
    })
    .strict()

const stopWithBoundaryMessageActionSchema = z
    .object({
        type: z.literal('stop_with_boundary_message'),
        message: z.string().trim().min(1).max(PLANNING_DECISION_LIMITS.maxMessageChars),
        reason: planningDecisionReasonSchema,
    })
    .strict()

// Planner 合同：模型只允许在这 5 类安全 decision 中选择，Runtime 再决定是否推进状态机。
export const versionPlanTasklistPlanningDecisionActionSchema = z.discriminatedUnion('type', [
    proceedToTasklistStrategyActionSchema,
    readOptionalContextActionSchema,
    askClarificationActionSchema,
    proceedWithManualReviewItemsActionSchema,
    stopWithBoundaryMessageActionSchema,
])

export const versionPlanTasklistStrategySchema = z
    .object({
        granularity: z.enum(['coarse', 'medium', 'detailed']),
        expectedStepRange: z
            .tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(30)])
            .refine(([min, max]) => min <= max, 'expectedStepRange 最小值不能大于最大值。'),
        grouping: z.array(strategyTextSchema).min(1).max(8),
        priority: z.array(strategyTextSchema).min(1).max(8),
        reason: planningDecisionReasonSchema,
    })
    .strict()

export const versionPlanTasklistPlanningDecisionOutputSchema = z
    .object({
        decision: versionPlanTasklistPlanningDecisionActionSchema,
        strategy: versionPlanTasklistStrategySchema.optional(),
    })
    .strict()
    .superRefine((value, context) => {
        if (value.decision.type === 'proceed_to_tasklist_strategy' || value.decision.type === 'proceed_with_manual_review_items') {
            if (!value.strategy) {
                context.addIssue({
                    code: 'custom',
                    message: '继续生成任务清单时必须同时输出拆分策略。',
                    path: ['strategy'],
                })
            }

            return
        }

        if (value.strategy) {
            context.addIssue({
                code: 'custom',
                message: 'read_optional_context / ask_clarification / stop_with_boundary_message 的首次 decision 不能同时输出 strategy。',
                path: ['strategy'],
            })
        }
    })

export interface ParsedPlanningDecisionActionResult {
    // success=false 时不抛异常，方便 Runtime 把非法 decision 作为受控失败处理。
    action?: PlanningDecisionAction
    error?: string
    success: boolean
}

export interface ParsedTasklistStrategyResult {
    error?: string
    strategy?: TasklistStrategy
    success: boolean
}

export interface ParsedPlanningDecisionOutputResult {
    error?: string
    output?: PlanningDecisionOutput
    success: boolean
}

export function parseVersionPlanTasklistPlanningDecisionAction(value: unknown): ParsedPlanningDecisionActionResult {
    const parsedAction = versionPlanTasklistPlanningDecisionActionSchema.safeParse(value)

    if (!parsedAction.success) {
        return {
            error: parsedAction.error.issues.map(issue => issue.message).join('; '),
            success: false,
        }
    }

    return {
        action: parsedAction.data,
        success: true,
    }
}

export function parseVersionPlanTasklistStrategy(value: unknown): ParsedTasklistStrategyResult {
    const parsedStrategy = versionPlanTasklistStrategySchema.safeParse(value)

    if (!parsedStrategy.success) {
        return {
            error: parsedStrategy.error.issues.map(issue => issue.message).join('; '),
            success: false,
        }
    }

    return {
        strategy: parsedStrategy.data as TasklistStrategy,
        success: true,
    }
}

export function parseVersionPlanTasklistPlanningDecisionOutput(value: unknown): ParsedPlanningDecisionOutputResult {
    const parsedOutput = versionPlanTasklistPlanningDecisionOutputSchema.safeParse(value)

    if (!parsedOutput.success) {
        return {
            error: parsedOutput.error.issues.map(issue => issue.message).join('; '),
            success: false,
        }
    }

    return {
        output: parsedOutput.data as PlanningDecisionOutput,
        success: true,
    }
}

export function parseVersionPlanTasklistPlanningDecisionOutputText(actionText: string): ParsedPlanningDecisionOutputResult {
    try {
        return parseVersionPlanTasklistPlanningDecisionOutput(JSON.parse(actionText))
    } catch {
        return {
            error: '规划决策输出不是合法 JSON。',
            success: false,
        }
    }
}

export function parseVersionPlanTasklistPlanningDecisionText(actionText: string): ParsedPlanningDecisionActionResult {
    try {
        return parseVersionPlanTasklistPlanningDecisionAction(JSON.parse(actionText))
    } catch {
        return {
            error: '规划决策不是合法 JSON。',
            success: false,
        }
    }
}
