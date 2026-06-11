export const VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS = {
    askClarification: 'askClarification',
    decideTasklistStrategy: 'decideTasklistStrategy',
    decideWarningDisposition: 'decideWarningDisposition',
    draftTasklistV1: 'draftTasklistV1',
    emitFinalArtifact: 'emitFinalArtifact',
    evaluatePlanReadiness: 'evaluatePlanReadiness',
    evaluateRevisionEffect: 'evaluateRevisionEffect',
    planningDecision: 'planningDecision',
    readOptionalContext: 'readOptionalContext',
    readVersionPlan: 'readVersionPlan',
    reviseTasklistV2: 'reviseTasklistV2',
    stopWithBoundaryMessage: 'stopWithBoundaryMessage',
    validateTasklistV1: 'validateTasklistV1',
    validateTasklistV2: 'validateTasklistV2',
} as const

export type VersionPlanTasklistGraphNodeId =
    (typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS)[keyof typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS]
