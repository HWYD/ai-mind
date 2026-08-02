import { z } from 'zod'

import { promptInspectionSchema } from '../../contract/image-generation-contracts'
import type { ImageGenerationGraphState } from '../graph-state'
import { type ImagePlanningModel, invokeStructuredPlanning } from './planning-model'

const promptSchema = z.object({ prompt: z.string().trim().min(1).max(4_000) }).strict()

export async function createPromptDraftNode(input: {
    model: ImagePlanningModel
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<ImageGenerationGraphState> {
    const result = await invokeStructuredPlanning({
        instruction: 'Draft one image-generation prompt faithful to the supplied image brief.',
        model: input.model,
        schema: promptSchema,
        schemaName: 'ImagePromptDraft',
        signal: input.signal,
        state: input.state,
    })

    return 'failureCode' in result ? result.state : { ...result.state, prompt: { ...result.state.prompt, value: result.output.prompt } }
}

export async function inspectPromptNode(input: {
    model: ImagePlanningModel
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<ImageGenerationGraphState> {
    const result = await invokeStructuredPlanning({
        instruction: 'Classify the image prompt as pass, one repair, or block. Return no reasoning.',
        model: input.model,
        schema: promptInspectionSchema,
        schemaName: 'PromptInspection',
        signal: input.signal,
        state: input.state,
    })

    return 'failureCode' in result ? result.state : { ...result.state, prompt: { ...result.state.prompt, inspection: result.output } }
}

export async function revisePromptNode(input: {
    model: ImagePlanningModel
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<ImageGenerationGraphState> {
    if (input.state.execution.promptRevisionCount >= 1) {
        return { ...input.state, output: { failureCode: 'IMAGE_PROMPT_BLOCKED', status: 'blocked' } }
    }

    const result = await createPromptDraftNode(input)

    return result.output?.status === 'failed' ? result : { ...result, execution: { ...result.execution, promptRevisionCount: 1 } }
}
