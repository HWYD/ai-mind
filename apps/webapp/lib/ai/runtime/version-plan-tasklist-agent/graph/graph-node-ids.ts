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
    regenerateTasklistStrategy: 'regenerateTasklistStrategy',
    reviewTasklistRevision: 'reviewTasklistRevision',
    reviewTasklistStrategy: 'reviewTasklistStrategy',
    reviseTasklistV2: 'reviseTasklistV2',
    reviseTasklistV3: 'reviseTasklistV3',
    stopWithBoundaryMessage: 'stopWithBoundaryMessage',
    validateTasklistV1: 'validateTasklistV1',
    validateTasklistV2: 'validateTasklistV2',
    validateTasklistV3: 'validateTasklistV3',
} as const

export type VersionPlanTasklistGraphNodeId =
    (typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS)[keyof typeof VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS]
