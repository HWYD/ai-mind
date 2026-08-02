import type { ImageGenerationGraphState } from '../graph-state'

export function completeBlockedPromptNode(state: ImageGenerationGraphState): ImageGenerationGraphState {
    if (state.output?.status === 'failed') {
        return state
    }

    return {
        ...state,
        output: {
            failureCode: state.output?.failureCode ?? 'IMAGE_PROMPT_BLOCKED',
            status: 'blocked',
        },
    }
}

export function completeReadyPromptNode(state: ImageGenerationGraphState): ImageGenerationGraphState {
    return {
        ...state,
        output: {
            status: 'ready',
        },
    }
}
