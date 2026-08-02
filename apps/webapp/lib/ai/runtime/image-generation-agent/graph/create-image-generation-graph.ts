import { END, START, StateGraph } from '@langchain/langgraph'

import { routeAfterPromptInspection } from './edges/route-after-prompt-inspection'
import { IMAGE_GENERATION_GRAPH_NODE_IDS, type ImageGenerationGraphNodeId } from './graph-node-ids'
import { type ImageGenerationGraphState, ImageGenerationGraphStateAnnotation } from './graph-state'
import { completeBlockedPromptNode, completeReadyPromptNode } from './nodes/final-nodes'
import { createImageBriefNode } from './nodes/image-brief-node'
import type { ImagePlanningModel } from './nodes/planning-model'
import { createPromptDraftNode, inspectPromptNode, revisePromptNode } from './nodes/prompt-nodes'

export interface ImageGenerationGraphNodeEvent {
    nodeId: ImageGenerationGraphNodeId
    state: ImageGenerationGraphState
}

export interface CreateImageGenerationGraphOptions {
    model: ImagePlanningModel
    onNodeEnd?: (event: ImageGenerationGraphNodeEvent) => void
    onNodeStart?: (event: ImageGenerationGraphNodeEvent) => void
    signal?: AbortSignal
}

/**
 * v0.4.12 不使用 checkpoint、interrupt 或 resume；每次调用只绑定一次运行期模型与取消信号。
 */
export function createImageGenerationGraph(options: CreateImageGenerationGraphOptions) {
    const nodeIds = IMAGE_GENERATION_GRAPH_NODE_IDS
    const nodeOptions = (state: ImageGenerationGraphState) => ({
        model: options.model,
        signal: options.signal,
        state,
    })

    const runNode =
        (
            nodeId: ImageGenerationGraphNodeId,
            handler: (state: ImageGenerationGraphState) => Promise<ImageGenerationGraphState> | ImageGenerationGraphState
        ) =>
        async (state: ImageGenerationGraphState) => {
            options.onNodeStart?.({ nodeId, state })
            const nextState = await handler(state)
            options.onNodeEnd?.({ nodeId, state: nextState })
            return nextState
        }

    return new StateGraph(ImageGenerationGraphStateAnnotation)
        .addNode(
            nodeIds.createImageBrief,
            runNode(nodeIds.createImageBrief, state => createImageBriefNode(nodeOptions(state)))
        )
        .addNode(
            nodeIds.draftPrompt,
            runNode(nodeIds.draftPrompt, state => createPromptDraftNode(nodeOptions(state)))
        )
        .addNode(
            nodeIds.inspectPrompt,
            runNode(nodeIds.inspectPrompt, state => inspectPromptNode(nodeOptions(state)))
        )
        .addNode(
            nodeIds.revisePrompt,
            runNode(nodeIds.revisePrompt, state => revisePromptNode(nodeOptions(state)))
        )
        .addNode(nodeIds.finishBlocked, runNode(nodeIds.finishBlocked, completeBlockedPromptNode))
        .addNode(nodeIds.finishReady, runNode(nodeIds.finishReady, completeReadyPromptNode))
        .addEdge(START, nodeIds.createImageBrief)
        .addConditionalEdges(nodeIds.createImageBrief, state => (state.output ? END : nodeIds.draftPrompt), [nodeIds.draftPrompt, END])
        .addConditionalEdges(nodeIds.draftPrompt, state => (state.output ? END : nodeIds.inspectPrompt), [nodeIds.inspectPrompt, END])
        .addConditionalEdges(nodeIds.inspectPrompt, routeAfterPromptInspection, [
            nodeIds.finishBlocked,
            nodeIds.finishReady,
            nodeIds.revisePrompt,
        ])
        .addConditionalEdges(nodeIds.revisePrompt, state => (state.output ? END : nodeIds.inspectPrompt), [nodeIds.inspectPrompt, END])
        .addEdge(nodeIds.finishBlocked, END)
        .addEdge(nodeIds.finishReady, END)
        .compile({ name: 'image-generation-agent-graph' })
}
