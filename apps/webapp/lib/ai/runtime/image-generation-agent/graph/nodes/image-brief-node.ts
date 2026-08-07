import { imageBriefSchema } from '../../contract/image-generation-contracts'
import type { ImageGenerationGraphState } from '../graph-state'
import { type ImagePlanningModel, invokeStructuredPlanning } from './planning-model'

export async function createImageBriefNode(input: {
    model: ImagePlanningModel
    signal?: AbortSignal
    state: ImageGenerationGraphState
}): Promise<ImageGenerationGraphState> {
    const result = await invokeStructuredPlanning({
        instruction:
            'Create a bounded image brief from the immutable user description. Do not add unsupported capabilities. Use Simplified Chinese for intent, subjects, mustInclude, avoid, assumptions, composition, lightingAndColor, scene, and style so the public summary is Chinese. Preserve requested literal visibleText exactly.',
        model: input.model,
        schema: imageBriefSchema,
        schemaName: 'ImageBrief',
        signal: input.signal,
        state: input.state,
    })

    return 'failureCode' in result
        ? result.state
        : {
              ...result.state,
              brief: { internal: result.output, publicSummary: result.output },
              execution: { ...result.state.execution, stage: 'prompting' },
          }
}
