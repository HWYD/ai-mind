import { createImageGenerationGraph, type CreateImageGenerationGraphOptions } from './create-image-generation-graph'
import { createInitialImageGenerationGraphState, type ImageGenerationGraphState } from './graph-state'
import type { ImagePlanningModel } from './nodes/planning-model'

export interface RunImageGenerationGraphOptions extends Pick<CreateImageGenerationGraphOptions, 'onNodeEnd' | 'onNodeStart'> {
    model: ImagePlanningModel
    rawDescription: string
    runId: string
    signal?: AbortSignal
}

export async function runImageGenerationGraph(options: RunImageGenerationGraphOptions): Promise<ImageGenerationGraphState> {
    return createImageGenerationGraph({
        model: options.model,
        onNodeEnd: options.onNodeEnd,
        onNodeStart: options.onNodeStart,
        signal: options.signal,
    }).invoke(createInitialImageGenerationGraphState({ rawDescription: options.rawDescription, runId: options.runId }))
}
