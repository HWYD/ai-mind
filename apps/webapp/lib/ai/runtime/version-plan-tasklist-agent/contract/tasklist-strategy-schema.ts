import { z } from 'zod'

export const tasklistStrategyGranularities = ['coarse', 'medium', 'detailed'] as const
export const tasklistStrategyStepCountRanges = ['3-5', '5-8', '8-12'] as const
export const tasklistStrategyGroupings = ['by_phase', 'by_module', 'by_risk', 'by_test_flow'] as const
export const tasklistStrategyPriorityFocuses = [
    'core_runtime',
    'state_model',
    'frontend_ui',
    'tests',
    'docs',
    'deployment',
    'compatibility',
] as const

export const tasklistStrategySchema = z
    .object({
        granularity: z.enum(tasklistStrategyGranularities),
        stepCountRange: z.enum(tasklistStrategyStepCountRanges),
        grouping: z.enum(tasklistStrategyGroupings),
        priorityFocus: z
            .array(z.enum(tasklistStrategyPriorityFocuses))
            .min(1)
            .max(tasklistStrategyPriorityFocuses.length)
            .refine(items => new Set(items).size === items.length, 'priorityFocus 不能包含重复项。'),
        notes: z.string().trim().min(1).max(500).optional(),
    })
    .strict()

export type TasklistStrategy = z.infer<typeof tasklistStrategySchema>
export type TasklistStrategyGranularity = (typeof tasklistStrategyGranularities)[number]
export type TasklistStrategyStepCountRange = (typeof tasklistStrategyStepCountRanges)[number]
export type TasklistStrategyGrouping = (typeof tasklistStrategyGroupings)[number]
export type TasklistStrategyPriorityFocus = (typeof tasklistStrategyPriorityFocuses)[number]

const TASKLIST_STRATEGY_STEP_COUNT_BOUNDS: Record<TasklistStrategyStepCountRange, [number, number]> = {
    '3-5': [3, 5],
    '5-8': [5, 8],
    '8-12': [8, 12],
}

export function getTasklistStrategyStepCountBounds(range: TasklistStrategyStepCountRange): [number, number] {
    return TASKLIST_STRATEGY_STEP_COUNT_BOUNDS[range]
}
