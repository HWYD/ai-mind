import { z } from 'zod'

import { strategyReviewDecisionSchema, tasklistRevisionReviewDecisionSchema } from './hitl-review-schema'
import {
    versionPlanTasklistManualReviewItemSchema,
    versionPlanTasklistPlanningDecisionActionSchema,
    versionPlanTasklistStrategySchema,
} from './planner-output-schema'
import type { VersionPlanTasklistAgentAction } from './types'

const runtimeActionReasonSchema = z.string().min(1)

// Runtime action 合同：这里校验状态机可消费的内部 action，不等同于模型 allowed action。
const readResourceActionSchema = z.object({
    type: z.literal('read_resource'),
    resourceUri: z.string().min(1),
    reason: runtimeActionReasonSchema,
})

const checkPlanReadinessActionSchema = z.object({
    type: z.literal('check_plan_readiness'),
    reason: runtimeActionReasonSchema,
})

const planningDecisionActionSchema = z.object({
    type: z.literal('planning_decision'),
    decision: versionPlanTasklistPlanningDecisionActionSchema,
    reason: runtimeActionReasonSchema,
})

const decideTasklistStrategyActionSchema = z.object({
    type: z.literal('decide_tasklist_strategy'),
    strategy: versionPlanTasklistStrategySchema,
    reason: runtimeActionReasonSchema,
})

const applyStrategyReviewDecisionActionSchema = z.object({
    type: z.literal('apply_strategy_review_decision'),
    decision: strategyReviewDecisionSchema,
    reason: runtimeActionReasonSchema,
})

const regenerateTasklistStrategyActionSchema = z.object({
    type: z.literal('regenerate_tasklist_strategy'),
    strategy: versionPlanTasklistStrategySchema,
    reason: runtimeActionReasonSchema,
})

const draftTasklistActionSchema = z.object({
    type: z.literal('draft_tasklist'),
    targetVersion: z.string().min(1).optional(),
    planUri: z.string().min(1),
    goal: z.string().min(1),
    reason: runtimeActionReasonSchema,
})

const callToolActionSchema = z.object({
    type: z.literal('call_tool'),
    toolName: z.literal('validate_tasklist_structure'),
    arguments: z.record(z.string(), z.unknown()),
    reason: runtimeActionReasonSchema,
})

const reviseTasklistActionSchema = z.object({
    type: z.literal('revise_tasklist'),
    reason: runtimeActionReasonSchema,
})

const finalAnswerActionSchema = z.object({
    type: z.literal('final_answer'),
    reason: runtimeActionReasonSchema,
})

export const versionPlanTasklistWarningDispositionSchema = z
    .object({
        fixNow: z.array(z.string().trim().min(1)).max(20),
        manualReviewItems: z.array(versionPlanTasklistManualReviewItemSchema).max(20),
        reason: runtimeActionReasonSchema,
    })
    .strict()

const decideWarningDispositionActionSchema = z.object({
    type: z.literal('decide_warning_disposition'),
    disposition: versionPlanTasklistWarningDispositionSchema,
    reason: runtimeActionReasonSchema,
})

const applyTasklistRevisionReviewDecisionActionSchema = z.object({
    type: z.literal('apply_tasklist_revision_review_decision'),
    decision: tasklistRevisionReviewDecisionSchema,
    reason: runtimeActionReasonSchema,
})

export const versionPlanTasklistRevisionEffectResultSchema = z
    .object({
        improved: z.boolean(),
        scoreBefore: z.number().min(0).max(100),
        scoreAfter: z.number().min(0).max(100),
        fixedIssues: z.array(z.string().trim().min(1)).max(50),
        remainingIssues: z.array(z.string().trim().min(1)).max(50),
        finalDecision: z.enum(['final', 'final_with_manual_review_items', 'blocked']),
    })
    .strict()

const evaluateRevisionEffectActionSchema = z.object({
    type: z.literal('evaluate_revision_effect'),
    effect: versionPlanTasklistRevisionEffectResultSchema,
    reason: runtimeActionReasonSchema,
})

export const versionPlanTasklistAgentActionSchema = z.discriminatedUnion('type', [
    readResourceActionSchema,
    checkPlanReadinessActionSchema,
    planningDecisionActionSchema,
    decideTasklistStrategyActionSchema,
    applyStrategyReviewDecisionActionSchema,
    regenerateTasklistStrategyActionSchema,
    draftTasklistActionSchema,
    callToolActionSchema,
    decideWarningDispositionActionSchema,
    applyTasklistRevisionReviewDecisionActionSchema,
    evaluateRevisionEffectActionSchema,
    reviseTasklistActionSchema,
    finalAnswerActionSchema,
])

export interface ParsedAgentActionResult {
    // success=false 时不抛异常，方便调用方把解析失败归入当前 Agent step 的显式错误。
    action?: VersionPlanTasklistAgentAction
    error?: string
    success: boolean
}

// Planner 文本会先被当成 unknown 处理，只有通过这层 schema 后才允许进入 Runtime 状态机。
export function parseVersionPlanTasklistAgentAction(value: unknown): ParsedAgentActionResult {
    const parsedAction = versionPlanTasklistAgentActionSchema.safeParse(value)

    if (!parsedAction.success) {
        return {
            error: parsedAction.error.issues.map(issue => issue.message).join('; '),
            success: false,
        }
    }

    return {
        action: parsedAction.data as VersionPlanTasklistAgentAction,
        success: true,
    }
}

// 这层只负责把模型文本解析为 JSON action；解析失败会直接返回显式错误。
export function parseVersionPlanTasklistPlannerActionText(actionText: string): ParsedAgentActionResult {
    try {
        return parseVersionPlanTasklistAgentAction(JSON.parse(actionText))
    } catch {
        return {
            error: 'Planner action 不是合法 JSON。',
            success: false,
        }
    }
}
