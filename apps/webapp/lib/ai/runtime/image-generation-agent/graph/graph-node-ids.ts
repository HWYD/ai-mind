export const IMAGE_GENERATION_GRAPH_NODE_IDS = {
    createImageBrief: 'createImageBrief',
    draftPrompt: 'draftPrompt',
    inspectPrompt: 'inspectPrompt',
    revisePrompt: 'revisePrompt',
    finishBlocked: 'finishBlocked',
    finishReady: 'finishReady',
} as const

export type ImageGenerationGraphNodeId = (typeof IMAGE_GENERATION_GRAPH_NODE_IDS)[keyof typeof IMAGE_GENERATION_GRAPH_NODE_IDS]
