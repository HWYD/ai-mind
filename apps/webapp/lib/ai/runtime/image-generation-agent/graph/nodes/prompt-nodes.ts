import { z } from 'zod'

import { promptBlockConfirmationSchema, promptInspectionSchema } from '../../contract/image-generation-contracts'
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

export async function confirmPromptBlockNode(input: {
    model: ImagePlanningModel
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<ImageGenerationGraphState> {
    const result = await invokeStructuredPlanning({
        instruction:
            'Confirm a block only when the raw user description literally contains two mutually exclusive requirements that cannot appear in one static image. Do not block because of style, aspect ratio, quality, avoid constraints, inferred assumptions, or ordinary image-generation capability. If blocking, return exactly two distinct literal fragments copied from the raw user description as conflictingRequirements. Otherwise pass.',
        model: input.model,
        schema: promptBlockConfirmationSchema,
        schemaName: 'PromptBlockConfirmation',
        signal: input.signal,
        state: input.state,
    })

    if ('failureCode' in result) {
        return {
            ...input.state,
            execution: result.state.execution,
            prompt: { ...input.state.prompt, blockConfirmation: { outcome: 'pass' } },
        }
    }

    const conflictingRequirements = result.output.conflictingRequirements
    const hasLiteralConflict =
        result.output.outcome === 'block' &&
        conflictingRequirements !== undefined &&
        conflictingRequirements[0] !== conflictingRequirements[1] &&
        conflictingRequirements.every(requirement => input.state.input.rawDescription.includes(requirement))

    return {
        ...result.state,
        prompt: {
            ...result.state.prompt,
            blockConfirmation: hasLiteralConflict ? { conflictingRequirements, outcome: 'block' } : { outcome: 'pass' },
        },
    }
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
