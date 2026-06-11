import type { AgentGraphDebugSummary } from '@ai-mind/stream-core/protocol'

import type { VersionPlanTasklistGraphStateAnnotationState } from './graph-state'

export type VersionPlanTasklistGraphDebugSummary = AgentGraphDebugSummary

export function buildGraphDebugSummary(graphState: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphDebugSummary {
    const agentState = graphState.agentState
    const planning = agentState.artifacts.planning
    const tasklistDraft = agentState.artifacts.tasklistDraft

    return {
        checkpointMode: graphState.graph.checkpointMode,
        currentNode: graphState.graph.currentNode,
        decision: planning.decision
            ? {
                  type: planning.decision.type,
              }
            : undefined,
        draftRevisions: agentState.counters.draftRevisions,
        lastRoute: graphState.graph.lastRoute
            ? {
                  fromNodeId: graphState.graph.lastRoute.fromNodeId,
                  label: graphState.graph.lastRoute.label,
                  toNodeId: graphState.graph.lastRoute.toNodeId,
              }
            : undefined,
        manualReviewItemCount: planning.manualReviewItems.length,
        maxDraftRevisions: agentState.limits.maxDraftRevisions,
        maxOptionalContextReads: agentState.limits.maxOptionalContextReads,
        maxSteps: agentState.limits.maxSteps,
        optionalContext: planning.optionalContext
            ? {
                  status: planning.optionalContext.status,
              }
            : undefined,
        optionalContextReads: agentState.counters.optionalContextReads,
        readiness: planning.readiness
            ? {
                  status: planning.readiness.status,
              }
            : undefined,
        revisionEffect: planning.revisionEffect
            ? {
                  finalDecision: planning.revisionEffect.finalDecision,
              }
            : undefined,
        runId: agentState.runId,
        runtimeMode: graphState.graph.runtimeMode,
        stepCount: agentState.counters.steps,
        strategy: planning.strategy
            ? {
                  expectedStepRange: planning.strategy.expectedStepRange,
                  granularity: planning.strategy.granularity,
              }
            : undefined,
        threadId: graphState.threadId,
        validationV1: tasklistDraft?.validationV1
            ? {
                  score: tasklistDraft.validationV1.score,
                  status: tasklistDraft.validationV1.status,
              }
            : undefined,
        validationV2: tasklistDraft?.validationV2
            ? {
                  score: tasklistDraft.validationV2.score,
                  status: tasklistDraft.validationV2.status,
              }
            : undefined,
        visitedNodes: [...graphState.graph.visitedNodes],
        warningDisposition: planning.warningDisposition
            ? {
                  fixNowCount: planning.warningDisposition.fixNow.length,
                  manualReviewItemCount: planning.warningDisposition.manualReviewItems.length,
              }
            : undefined,
    }
}
