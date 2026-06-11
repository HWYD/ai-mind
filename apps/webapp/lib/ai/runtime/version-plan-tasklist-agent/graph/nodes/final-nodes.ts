import { writeStaticTextPart } from '@ai-mind/stream-core'

import type { PlanningDecisionAction } from '../../contract/types'
import { buildStoppedPlanningDecisionAnswer, runFinalAnswerStep } from '../../stream/tasklist-agent-output'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from '../graph-node-runtime'
import {
    createGraphNodeRuntimeUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStateAnnotationUpdate,
} from '../graph-state'

function getStoppedPlanningDecision(
    state: VersionPlanTasklistGraphStateAnnotationState
): Extract<PlanningDecisionAction, { type: 'ask_clarification' | 'stop_with_boundary_message' }> {
    const decision = state.agentState.artifacts.planning.decision

    if (decision?.type !== 'ask_clarification' && decision?.type !== 'stop_with_boundary_message') {
        throw new Error('当前 PlanningDecisionAction 不是 stopped path。')
    }

    return decision
}

export function createEmitFinalArtifactNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function emitFinalArtifactNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const nextAgentState = runFinalAnswerStep({
            state: state.agentState,
            writeChunk: runtime.writeChunk,
        })

        return {
            agentState: nextAgentState,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.emitFinalArtifact,
                summary: `已输出最终任务清单产物，Agent 状态：${nextAgentState.status}。`,
            }),
            output: {
                status: 'final',
                textSummary: '已输出任务清单草稿产物和结构校验摘要。',
            },
        }
    }
}

export function createAskClarificationNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function askClarificationNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const decision = getStoppedPlanningDecision(state)

        writeStaticTextPart(runtime.writeChunk, buildStoppedPlanningDecisionAnswer(decision))

        return {
            agentState: state.agentState,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.askClarification,
                summary: '已输出澄清问题，本轮 graph 停止。',
            }),
            output: {
                status: 'stopped',
                textSummary: '缺少关键信息，已输出澄清问题。',
            },
        }
    }
}

export function createStopWithBoundaryMessageNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function stopWithBoundaryMessageNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const decision = getStoppedPlanningDecision(state)

        writeStaticTextPart(runtime.writeChunk, buildStoppedPlanningDecisionAnswer(decision))

        return {
            agentState: state.agentState,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.stopWithBoundaryMessage,
                summary: '已输出边界停止提示，本轮 graph 停止。',
            }),
            output: {
                status: 'stopped',
                textSummary: '请求不符合 Agent 边界，已停止生成任务清单。',
            },
        }
    }
}
