import { hasBlockingPromptInspectionIssue, hasFixablePromptInspectionIssue } from '../../contract/image-generation-contracts'
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

    const inspection = state.prompt.inspection

    if (!inspection || hasBlockingPromptInspectionIssue(inspection)) {
        return IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
    }

    if (inspection.outcome === 'revise' && hasFixablePromptInspectionIssue(inspection)) {
        return state.execution.promptRevisionCount === 0
            ? IMAGE_GENERATION_GRAPH_NODE_IDS.revisePrompt
            : IMAGE_GENERATION_GRAPH_NODE_IDS.finishBlocked
    }

    return IMAGE_GENERATION_GRAPH_NODE_IDS.finishReady
}
