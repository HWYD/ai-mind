import { type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph'

import { routeAfterPlanningDecision } from './edges/route-after-planning-decision'
import { routeAfterReadVersionPlan } from './edges/route-after-read-version-plan'
import { routeAfterStrategyReview } from './edges/route-after-strategy-review'
import { routeAfterTasklistRevisionReview } from './edges/route-after-tasklist-revision-review'
import { routeAfterTasklistStrategy } from './edges/route-after-tasklist-strategy'
import { routeAfterWarningDisposition } from './edges/route-after-warning-disposition'
import { type GraphNodeHandler, withGraphNodeEvents } from './graph-events'
import type { VersionPlanTasklistGraphNodeId } from './graph-node-ids'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from './graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from './graph-node-runtime'
import { VersionPlanTasklistGraphStateAnnotation } from './graph-state'
import { createAskClarificationNode, createEmitFinalArtifactNode, createStopWithBoundaryMessageNode } from './nodes/final-nodes'
import { createReviewTasklistRevisionNode, createReviewTasklistStrategyNode } from './nodes/hitl-nodes'
import {
    createDecideTasklistStrategyNode,
    createEvaluatePlanReadinessNode,
    createPlanningDecisionNode,
    createReadOptionalContextNode,
    createReadVersionPlanNode,
    createRegenerateTasklistStrategyNode,
} from './nodes/planning-nodes'
import {
    createDecideWarningDispositionNode,
    createDraftTasklistV1Node,
    createEvaluateRevisionEffectNode,
    createReviseTasklistV2Node,
    createReviseTasklistV3Node,
    createValidateTasklistV1Node,
    createValidateTasklistV2Node,
    createValidateTasklistV3Node,
} from './nodes/tasklist-nodes'

export interface CreateVersionPlanTasklistGraphOptions {
    checkpointer?: BaseCheckpointSaver
    graphName?: string
    runtime: VersionPlanTasklistGraphNodeRuntime
}

export function createVersionPlanTasklistGraph(options: CreateVersionPlanTasklistGraphOptions) {
    const nodeIds = VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS
    const withEvents = (nodeId: VersionPlanTasklistGraphNodeId, node: GraphNodeHandler) =>
        withGraphNodeEvents(nodeId, node, options.runtime)

    return new StateGraph(VersionPlanTasklistGraphStateAnnotation)
        .addNode(nodeIds.readVersionPlan, withEvents(nodeIds.readVersionPlan, createReadVersionPlanNode(options.runtime)))
        .addNode(nodeIds.evaluatePlanReadiness, withEvents(nodeIds.evaluatePlanReadiness, createEvaluatePlanReadinessNode(options.runtime)))
        .addNode(nodeIds.planningDecision, withEvents(nodeIds.planningDecision, createPlanningDecisionNode(options.runtime)))
        .addNode(nodeIds.readOptionalContext, withEvents(nodeIds.readOptionalContext, createReadOptionalContextNode(options.runtime)))
        .addNode(
            nodeIds.decideTasklistStrategy,
            withEvents(nodeIds.decideTasklistStrategy, createDecideTasklistStrategyNode(options.runtime))
        )
        .addNode(nodeIds.reviewTasklistStrategy, withEvents(nodeIds.reviewTasklistStrategy, createReviewTasklistStrategyNode()))
        .addNode(
            nodeIds.regenerateTasklistStrategy,
            withEvents(nodeIds.regenerateTasklistStrategy, createRegenerateTasklistStrategyNode(options.runtime))
        )
        .addNode(nodeIds.draftTasklistV1, withEvents(nodeIds.draftTasklistV1, createDraftTasklistV1Node(options.runtime)))
        .addNode(nodeIds.validateTasklistV1, withEvents(nodeIds.validateTasklistV1, createValidateTasklistV1Node(options.runtime)))
        .addNode(
            nodeIds.decideWarningDisposition,
            withEvents(nodeIds.decideWarningDisposition, createDecideWarningDispositionNode(options.runtime))
        )
        .addNode(nodeIds.reviewTasklistRevision, withEvents(nodeIds.reviewTasklistRevision, createReviewTasklistRevisionNode()))
        .addNode(nodeIds.reviseTasklistV2, withEvents(nodeIds.reviseTasklistV2, createReviseTasklistV2Node(options.runtime)))
        .addNode(nodeIds.validateTasklistV2, withEvents(nodeIds.validateTasklistV2, createValidateTasklistV2Node(options.runtime)))
        .addNode(nodeIds.reviseTasklistV3, withEvents(nodeIds.reviseTasklistV3, createReviseTasklistV3Node(options.runtime)))
        .addNode(nodeIds.validateTasklistV3, withEvents(nodeIds.validateTasklistV3, createValidateTasklistV3Node(options.runtime)))
        .addNode(
            nodeIds.evaluateRevisionEffect,
            withEvents(nodeIds.evaluateRevisionEffect, createEvaluateRevisionEffectNode(options.runtime))
        )
        .addNode(nodeIds.emitFinalArtifact, withEvents(nodeIds.emitFinalArtifact, createEmitFinalArtifactNode(options.runtime)))
        .addNode(nodeIds.askClarification, withEvents(nodeIds.askClarification, createAskClarificationNode(options.runtime)))
        .addNode(
            nodeIds.stopWithBoundaryMessage,
            withEvents(nodeIds.stopWithBoundaryMessage, createStopWithBoundaryMessageNode(options.runtime))
        )
        .addEdge(START, nodeIds.readVersionPlan)
        .addConditionalEdges(nodeIds.readVersionPlan, routeAfterReadVersionPlan, [nodeIds.evaluatePlanReadiness, END])
        .addEdge(nodeIds.evaluatePlanReadiness, nodeIds.planningDecision)
        .addConditionalEdges(nodeIds.planningDecision, routeAfterPlanningDecision, [
            nodeIds.askClarification,
            nodeIds.stopWithBoundaryMessage,
            nodeIds.readOptionalContext,
            nodeIds.decideTasklistStrategy,
            END,
        ])
        .addEdge(nodeIds.readOptionalContext, nodeIds.decideTasklistStrategy)
        .addConditionalEdges(nodeIds.decideTasklistStrategy, routeAfterTasklistStrategy, [nodeIds.reviewTasklistStrategy, END])
        .addConditionalEdges(nodeIds.reviewTasklistStrategy, routeAfterStrategyReview, [
            nodeIds.draftTasklistV1,
            nodeIds.regenerateTasklistStrategy,
            END,
        ])
        .addEdge(nodeIds.regenerateTasklistStrategy, nodeIds.reviewTasklistStrategy)
        .addEdge(nodeIds.draftTasklistV1, nodeIds.validateTasklistV1)
        .addEdge(nodeIds.validateTasklistV1, nodeIds.decideWarningDisposition)
        .addConditionalEdges(nodeIds.decideWarningDisposition, routeAfterWarningDisposition, [
            nodeIds.reviewTasklistRevision,
            nodeIds.reviseTasklistV2,
            nodeIds.reviseTasklistV3,
            nodeIds.evaluateRevisionEffect,
        ])
        .addConditionalEdges(nodeIds.reviewTasklistRevision, routeAfterTasklistRevisionReview, [
            nodeIds.reviseTasklistV2,
            nodeIds.validateTasklistV2,
            END,
        ])
        .addEdge(nodeIds.reviseTasklistV2, nodeIds.validateTasklistV2)
        .addEdge(nodeIds.validateTasklistV2, nodeIds.decideWarningDisposition)
        .addEdge(nodeIds.reviseTasklistV3, nodeIds.validateTasklistV3)
        .addEdge(nodeIds.validateTasklistV3, nodeIds.evaluateRevisionEffect)
        .addEdge(nodeIds.evaluateRevisionEffect, nodeIds.emitFinalArtifact)
        .addEdge(nodeIds.emitFinalArtifact, END)
        .addEdge(nodeIds.askClarification, END)
        .addEdge(nodeIds.stopWithBoundaryMessage, END)
        .compile({
            checkpointer: options.checkpointer,
            name: options.graphName ?? 'version-plan-tasklist-agent-graph',
        })
}
