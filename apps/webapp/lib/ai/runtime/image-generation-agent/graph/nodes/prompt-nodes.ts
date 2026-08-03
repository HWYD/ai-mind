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
        instruction:
            'Draft one image-generation prompt from the supplied ImageBrief. Preserve its subjects, mustInclude and avoid constraints without adding unsupported capabilities.',
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
        instruction:
            'Compare the supplied current image-generation prompt with the supplied ImageBrief. Do not reinterpret the raw user description in isolation. Return block only for an unresolved blocking issue, revise only for a fixable issue with one concrete repair instruction, otherwise pass. Return no reasoning.',
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

    const result = await invokeStructuredPlanning({
        instruction:
            'Revise the supplied current image-generation prompt once using the supplied ImageBrief and revision instruction. Resolve only the identified fixable issue while preserving the required subjects and constraints.',
        model: input.model,
        schema: promptSchema,
        schemaName: 'ImagePromptDraft',
        signal: input.signal,
        state: input.state,
    })

    return 'failureCode' in result
        ? result.state
        : {
              ...result.state,
              execution: { ...result.state.execution, promptRevisionCount: 1 },
              prompt: { ...result.state.prompt, value: result.output.prompt },
          }
}
