import { IMAGE_GENERATION_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { ImageGenerationGraphState } from '../graph-state'

export type PromptInspectionRoute =
    | typeof IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
    | typeof IMAGE_GENERATION_GRAPH_NODE_IDS.finishReady
    | typeof IMAGE_GENERATION_GRAPH_NODE_IDS.revisePrompt

export function routeAfterPromptInspection(state: ImageGenerationGraphState): PromptInspectionRoute {
    if (state.output?.status === 'failed' || state.output?.status === 'blocked') {
        return IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
    }

    if (state.prompt.inspection?.outcome === 'revise' && state.execution.promptRevisionCount === 0) {
        return IMAGE_GENERATION_GRAPH_NODE_IDS.revisePrompt
    }

    return state.prompt.inspection?.outcome === 'block'
        ? IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
        : IMAGE_GENERATION_GRAPH_NODE_IDS.finishReady
}
