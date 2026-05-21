import { z } from 'zod'

import type { VersionPlanTasklistAgentAction } from './types'

// 下面的 schema 与 AgentAction union 一一对应，用 discriminatedUnion 保证 type 决定参数形状。
const readResourceActionSchema = z.object({
    type: z.literal('read_resource'),
    resourceUri: z.string().min(1),
    reason: z.string().min(1),
})

const draftTasklistActionSchema = z.object({
    type: z.literal('draft_tasklist'),
    targetVersion: z.string().min(1).optional(),
    planUri: z.string().min(1),
    goal: z.string().min(1),
    reason: z.string().min(1),
})

const callToolActionSchema = z.object({
    type: z.literal('call_tool'),
    toolName: z.literal('validate_tasklist_structure'),
    arguments: z.record(z.string(), z.unknown()),
    reason: z.string().min(1),
})

const reviseTasklistActionSchema = z.object({
    type: z.literal('revise_tasklist'),
    reason: z.string().min(1),
})

const finalAnswerActionSchema = z.object({
    type: z.literal('final_answer'),
    reason: z.string().min(1),
})

export const versionPlanTasklistAgentActionSchema = z.discriminatedUnion('type', [
    readResourceActionSchema,
    draftTasklistActionSchema,
    callToolActionSchema,
    reviseTasklistActionSchema,
    finalAnswerActionSchema,
])

export interface ParsedAgentActionResult {
    // success=false 时不抛异常，方便调用方把解析失败归入当前 Agent 步骤的显式错误。
    action?: VersionPlanTasklistAgentAction
    error?: string
    success: boolean
}

// Planner 的输出会先被当成普通 unknown 处理，只有通过这层 schema 后才允许进入 Runtime 状态机。
export function parseVersionPlanTasklistAgentAction(value: unknown): ParsedAgentActionResult {
    const parsedAction = versionPlanTasklistAgentActionSchema.safeParse(value)

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
