import type { ZodType } from 'zod'

import type { ImageBrief } from '../../contract/image-generation-contracts'
import { canCallPlanningModel, type ImageGenerationGraphFailureCode, type ImageGenerationGraphState } from '../graph-state'

export interface ImagePlanningInput {
    imageBrief?: ImageBrief
    instruction: string
    prompt?: string
    rawDescription: string
    revisionInstruction?: string
    schemaName: string
}

export interface ImagePlanningModel {
    invoke(input: ImagePlanningInput, options: { schema: ZodType<unknown>; signal?: AbortSignal }): Promise<unknown>
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
            {
                imageBrief: input.state.brief.internal,
                instruction: input.instruction,
                prompt: input.state.prompt.value,
                rawDescription: input.state.input.rawDescription,
                revisionInstruction: input.state.prompt.inspection?.revisionInstruction,
                schemaName: input.schemaName,
            },
            { schema: input.schema, signal: input.signal }
        )
        const parsed = input.schema.safeParse(rawOutput)

        if (parsed.success) {
            return { output: parsed.data, state }
        }
    } catch {
        // 底层瞬时重试由固定规划模型处理；本节点不额外启动结构修复。
    }

    return {
        failureCode: 'IMAGE_PROMPT_PLANNING_FAILED',
        state: { ...state, output: { failureCode: 'IMAGE_PROMPT_PLANNING_FAILED', status: 'failed' } },
    }
}
