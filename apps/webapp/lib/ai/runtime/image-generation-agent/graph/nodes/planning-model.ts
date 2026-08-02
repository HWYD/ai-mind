import type { ZodType } from 'zod'

import { canCallPlanningModel, type ImageGenerationGraphFailureCode, type ImageGenerationGraphState } from '../graph-state'

export interface ImagePlanningModel {
    invoke(
        input: { instruction: string; rawDescription: string; schemaName: string },
        options: { schema: ZodType<unknown>; signal?: AbortSignal }
    ): Promise<unknown>
}

export async function invokeStructuredPlanning<T>(input: {
    instruction: string
    model: ImagePlanningModel
    schema: ZodType<T>
    schemaName: string
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<
    { output: T; state: ImageGenerationGraphState } | { failureCode: ImageGenerationGraphFailureCode; state: ImageGenerationGraphState }
> {
    if (!canCallPlanningModel(input.state)) {
        return {
            failureCode: 'IMAGE_PROMPT_PLANNING_FAILED',
            state: {
                ...input.state,
                output: { failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' },
            },
        }
    }

    const state = {
        ...input.state,
        execution: { ...input.state.execution, planningModelCalls: input.state.execution.planningModelCalls + 1 },
    }

    try {
        const rawOutput = await input.model.invoke(
            { instruction: input.instruction, rawDescription: input.state.input.rawDescription, schemaName: input.schemaName },
            { schema: input.schema, signal: input.signal }
        )
        const parsed = input.schema.safeParse(rawOutput)

        if (parsed.success) {
            return { output: parsed.data, state }
        }
    } catch {
        // 规划调用只允许一次；失败不启动结构修复或重试。
    }

    return {
        failureCode: 'IMAGE_PROMPT_PLANNING_FAILED',
        state: { ...state, output: { failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' } },
    }
}
