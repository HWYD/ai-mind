import { writeStaticTextPart } from '@ai-mind/stream-core'

import { readOptionalContextForTasklistAgent } from '../../resources/optional-context-reader'
import { readVersionPlanForTasklistAgent } from '../../resources/version-plan-reader'
import { runPlanningDecisionStep, runPlanReadinessStep, runTasklistStrategyStep } from '../../steps/tasklist-agent-steps'
import { buildControlledPlannerOutputFailureAnswer } from '../../stream/tasklist-agent-output'
import { getNextStepIndex } from '../../stream/tasklist-agent-step-stream'
import { getRouteAfterPlanningDecision } from '../edges/route-after-planning-decision'
import { getRouteAfterReadVersionPlan } from '../edges/route-after-read-version-plan'
import { getRouteAfterTasklistStrategy } from '../edges/route-after-tasklist-strategy'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from '../graph-node-runtime'
import {
    createGraphNodeRuntimeUpdate,
    createGraphRouteRuntimeUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStateAnnotationUpdate,
} from '../graph-state'

function attachPendingDecisionStrategy(
    state: VersionPlanTasklistGraphStateAnnotationState['agentState'],
    strategy: VersionPlanTasklistGraphStateAnnotationState['agentState']['artifacts']['planning']['strategy']
) {
    if (!strategy) {
        return state
    }

    return {
        ...state,
        artifacts: {
            ...state.artifacts,
            planning: {
                ...state.artifacts.planning,
                strategy,
            },
        },
    }
}

export function createReadVersionPlanNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function readVersionPlanNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const result = await readVersionPlanForTasklistAgent(state.agentState, {
            context: runtime.context,
            stepIndex: getNextStepIndex(state.agentState),
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        if ('errorMessage' in result) {
            const output = {
                errorMessage: result.errorMessage,
                status: 'failed' as const,
                textSummary: '版本方案读取失败，未生成任务清单草稿。',
            }
            const nextState = {
                ...state,
                agentState: result.state,
                output,
            }
            const route = getRouteAfterReadVersionPlan(nextState)

            return {
                agentState: result.state,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
                        summary: '版本方案读取失败，graph 停止继续生成任务清单。',
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
                output,
            }
        }

        const nextState = {
            ...state,
            agentState: result.state,
        }
        const route = getRouteAfterReadVersionPlan(nextState)

        return {
            agentState: result.state,
            graph: {
                ...createGraphNodeRuntimeUpdate({
                    nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
                    summary: `已读取 version plan，目标版本 ${result.extract.targetVersion}。`,
                }),
                ...createGraphRouteRuntimeUpdate(route),
            },
        }
    }
}

export function createEvaluatePlanReadinessNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return function evaluatePlanReadinessNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): VersionPlanTasklistGraphStateAnnotationUpdate {
        const nextAgentState = runPlanReadinessStep({
            state: state.agentState,
            writeChunk: runtime.writeChunk,
        })
        const readiness = nextAgentState.artifacts.planning.readiness

        return {
            agentState: nextAgentState,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
                summary: `方案完整性状态：${readiness?.status ?? 'unknown'}。`,
            }),
        }
    }
}

export function createPlanningDecisionNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function planningDecisionNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        try {
            const result = await runPlanningDecisionStep({
                context: runtime.context,
                model: runtime.model,
                state: state.agentState,
                userGoal: runtime.userGoal,
                writeChunk: runtime.writeChunk,
            })
            const nextAgentState = attachPendingDecisionStrategy(result.state, result.output.strategy)
            const nextState = {
                ...state,
                agentState: nextAgentState,
            }
            const route = getRouteAfterPlanningDecision(nextState)

            return {
                agentState: nextAgentState,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                        summary: `规划决策：${result.output.decision.type}。`,
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
            }
        } catch (error) {
            const failureAnswer = buildControlledPlannerOutputFailureAnswer(error)

            if (!failureAnswer) {
                throw error
            }

            writeStaticTextPart(runtime.writeChunk, failureAnswer)

            const output = {
                status: 'stopped' as const,
                textSummary: '规划决策输出不符合受控 JSON schema，本轮已安全停止。',
            }
            const nextState = {
                ...state,
                output,
            }
            const route = getRouteAfterPlanningDecision(nextState)

            return {
                agentState: state.agentState,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
                        summary: output.textSummary,
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
                output,
            }
        }
    }
}

export function createReadOptionalContextNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function readOptionalContextNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const decision = state.agentState.artifacts.planning.decision

        if (decision?.type !== 'read_optional_context') {
            throw new Error('当前 PlanningDecisionAction 未授权读取补充上下文。')
        }

        const result = await readOptionalContextForTasklistAgent(state.agentState, {
            context: runtime.context,
            resourceUri: decision.resourceUri,
            stepIndex: getNextStepIndex(state.agentState),
            writeChunk: runtime.writeChunk,
        })

        return {
            agentState: result.state,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext,
                summary: `补充上下文读取${result.success ? '完成' : '失败并降级'}：${decision.resourceUri}。`,
            }),
        }
    }
}

export function createDecideTasklistStrategyNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function decideTasklistStrategyNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStateAnnotationUpdate> {
        const decision = state.agentState.artifacts.planning.decision
        const strategy =
            decision?.type === 'proceed_to_tasklist_strategy' || decision?.type === 'proceed_with_manual_review_items'
                ? state.agentState.artifacts.planning.strategy
                : undefined

        try {
            const nextAgentState = await runTasklistStrategyStep({
                context: runtime.context,
                model: runtime.model,
                state: state.agentState,
                strategy,
                userGoal: runtime.userGoal,
                writeChunk: runtime.writeChunk,
            })
            const nextState = {
                ...state,
                agentState: nextAgentState,
            }
            const route = getRouteAfterTasklistStrategy(nextState)

            return {
                agentState: nextAgentState,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
                        summary: `任务清单策略：${nextAgentState.artifacts.planning.strategy?.granularity ?? 'unknown'}。`,
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
            }
        } catch (error) {
            const failureAnswer = buildControlledPlannerOutputFailureAnswer(error)

            if (!failureAnswer) {
                throw error
            }

            writeStaticTextPart(runtime.writeChunk, failureAnswer)

            const output = {
                status: 'stopped' as const,
                textSummary: '任务清单拆分策略输出不符合受控 JSON schema，本轮已安全停止。',
            }
            const nextState = {
                ...state,
                output,
            }
            const route = getRouteAfterTasklistStrategy(nextState)

            return {
                agentState: state.agentState,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
                        summary: output.textSummary,
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
                output,
            }
        }
    }
}
