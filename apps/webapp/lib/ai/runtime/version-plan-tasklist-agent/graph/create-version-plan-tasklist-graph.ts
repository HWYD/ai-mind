import { type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph'

import { routeAfterPlanningDecision } from './edges/route-after-planning-decision'
import { routeAfterReadVersionPlan } from './edges/route-after-read-version-plan'
import { routeAfterTasklistStrategy } from './edges/route-after-tasklist-strategy'
import { routeAfterWarningDisposition } from './edges/route-after-warning-disposition'
import { type GraphNodeHandler, withGraphNodeEvents } from './graph-events'
import type { VersionPlanTasklistGraphNodeId } from './graph-node-ids'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from './graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from './graph-node-runtime'
import { VersionPlanTasklistGraphStateAnnotation } from './graph-state'
import { createAskClarificationNode, createEmitFinalArtifactNode, createStopWithBoundaryMessageNode } from './nodes/final-nodes'
import {
    createDecideTasklistStrategyNode,
    createEvaluatePlanReadinessNode,
    createPlanningDecisionNode,
    createReadOptionalContextNode,
    createReadVersionPlanNode,
} from './nodes/planning-nodes'
import {
    createDecideWarningDispositionNode,
    createDraftTasklistV1Node,
    createEvaluateRevisionEffectNode,
    createReviseTasklistV2Node,
    createValidateTasklistV1Node,
    createValidateTasklistV2Node,
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
        .addNode(nodeIds.draftTasklistV1, withEvents(nodeIds.draftTasklistV1, createDraftTasklistV1Node(options.runtime)))
        .addNode(nodeIds.validateTasklistV1, withEvents(nodeIds.validateTasklistV1, createValidateTasklistV1Node(options.runtime)))
        .addNode(
            nodeIds.decideWarningDisposition,
            withEvents(nodeIds.decideWarningDisposition, createDecideWarningDispositionNode(options.runtime))
        )
        .addNode(nodeIds.reviseTasklistV2, withEvents(nodeIds.reviseTasklistV2, createReviseTasklistV2Node(options.runtime)))
        .addNode(nodeIds.validateTasklistV2, withEvents(nodeIds.validateTasklistV2, createValidateTasklistV2Node(options.runtime)))
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
        .addConditionalEdges(nodeIds.decideTasklistStrategy, routeAfterTasklistStrategy, [nodeIds.draftTasklistV1, END])
        .addEdge(nodeIds.draftTasklistV1, nodeIds.validateTasklistV1)
        .addEdge(nodeIds.validateTasklistV1, nodeIds.decideWarningDisposition)
        .addConditionalEdges(nodeIds.decideWarningDisposition, routeAfterWarningDisposition, [
            nodeIds.reviseTasklistV2,
            nodeIds.evaluateRevisionEffect,
        ])
        .addEdge(nodeIds.reviseTasklistV2, nodeIds.validateTasklistV2)
        .addEdge(nodeIds.validateTasklistV2, nodeIds.evaluateRevisionEffect)
        .addEdge(nodeIds.evaluateRevisionEffect, nodeIds.emitFinalArtifact)
        .addEdge(nodeIds.emitFinalArtifact, END)
        .addEdge(nodeIds.askClarification, END)
        .addEdge(nodeIds.stopWithBoundaryMessage, END)
        .compile({
            checkpointer: options.checkpointer,
            name: options.graphName ?? 'version-plan-tasklist-agent-graph',
        })
}
