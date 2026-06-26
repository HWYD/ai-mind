import { writeStaticTextPart } from '@ai-mind/stream-core'
import { END } from '@langchain/langgraph'

import { readOptionalContextForTasklistAgent } from '../../resources/optional-context-reader'
import { readVersionPlanForTasklistAgent } from '../../resources/version-plan-reader'
import {
    runPlanningDecisionStep,
    runPlanReadinessStep,
    runRegenerateTasklistStrategyStep,
    runTasklistStrategyStep,
} from '../../steps/tasklist-agent-steps'
import { buildControlledPlannerOutputFailureAnswer } from '../../stream/tasklist-agent-output'
import { getNextStepIndex } from '../../stream/tasklist-agent-step-index'
import { getRouteAfterPlanningDecision } from '../edges/route-after-planning-decision'
import { getRouteAfterReadVersionPlan } from '../edges/route-after-read-version-plan'
import { getRouteAfterTasklistStrategy } from '../edges/route-after-tasklist-strategy'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '../graph-node-ids'
import type { VersionPlanTasklistGraphNodeRuntime } from '../graph-node-runtime'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    createGraphNodeRuntimeUpdate,
    createGraphRouteRuntimeUpdate,
    type VersionPlanTasklistGraphStateAnnotationState,
    type VersionPlanTasklistGraphStatePatch,
} from '../graph-state'

export function createReadVersionPlanNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function readVersionPlanNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const result = await readVersionPlanForTasklistAgent(state, {
            context: runtime.context,
            stepIndex: getNextStepIndex(state),
            userGoal: runtime.userGoal,
            writeChunk: runtime.writeChunk,
        })

        if (result.success === false) {
            const output = {
                errorMessage: result.errorMessage,
                status: 'failed' as const,
                textSummary: '版本方案读取失败，未生成任务清单草稿。',
            }
            const route = getRouteAfterReadVersionPlan({
                ...state,
                output,
            })

            return {
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
                        summary: '版本方案读取失败，Graph 停止继续生成任务清单。',
                    }),
                    ...createGraphRouteRuntimeUpdate(route),
                },
                output,
            }
        }

        const nextState = applyVersionPlanTasklistGraphStateUpdate(state, result.update)
        const route = getRouteAfterReadVersionPlan(nextState)

        return {
            ...result.update,
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
    return function evaluatePlanReadinessNode(state: VersionPlanTasklistGraphStateAnnotationState): VersionPlanTasklistGraphStatePatch {
        const update = runPlanReadinessStep({
            state,
            writeChunk: runtime.writeChunk,
        })

        return {
            ...update,
            graph: createGraphNodeRuntimeUpdate({
                nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
                summary: `方案完整性状态：${state.planning.readiness?.status ?? 'unknown'}。`,
            }),
        }
    }
}

export function createPlanningDecisionNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function planningDecisionNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        try {
            const result = await runPlanningDecisionStep({
                context: runtime.context,
                model: runtime.models.planning.model,
                modelStage: 'planning-decision',
                modelTimeoutMs: runtime.models.planning.timeoutMs,
                state,
                userGoal: runtime.userGoal,
                writeChunk: runtime.writeChunk,
            })
            const update =
                result.output.strategy && result.update.planning
                    ? {
                          ...result.update,
                          planning: {
                              ...result.update.planning,
                              strategy: result.output.strategy,
                          },
                      }
                    : result.update
            const nextState = applyVersionPlanTasklistGraphStateUpdate(state, update)
            const route = getRouteAfterPlanningDecision(nextState)

            return {
                ...update,
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
            const route = getRouteAfterPlanningDecision({
                ...state,
                output,
            })

            return {
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
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const decision = state.planning.decision

        if (decision?.type !== 'read_optional_context') {
            throw new Error('Current PlanningDecisionAction did not authorize optional context reading.')
        }

        const result = await readOptionalContextForTasklistAgent(state, {
            context: runtime.context,
            resourceUri: decision.resourceUri,
            stepIndex: getNextStepIndex(state),
            writeChunk: runtime.writeChunk,
        })

        return {
            ...result.update,
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
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        const decision = state.planning.decision
        const strategy =
            decision?.type === 'proceed_to_tasklist_strategy' || decision?.type === 'proceed_with_manual_review_items'
                ? state.planning.strategy
                : undefined

        try {
            const update = await runTasklistStrategyStep({
                context: runtime.context,
                model: runtime.models.planning.model,
                modelStage: 'tasklist-strategy',
                modelTimeoutMs: runtime.models.planning.timeoutMs,
                state,
                strategy,
                userGoal: runtime.userGoal,
                writeChunk: runtime.writeChunk,
            })
            const nextState = applyVersionPlanTasklistGraphStateUpdate(state, update)
            const route = getRouteAfterTasklistStrategy(nextState)

            return {
                ...update,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
                        summary: `任务清单策略：${update.planning?.strategy?.granularity ?? 'unknown'}。`,
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
            const route = getRouteAfterTasklistStrategy({
                ...state,
                output,
            })

            return {
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

export function createRegenerateTasklistStrategyNode(runtime: VersionPlanTasklistGraphNodeRuntime) {
    return async function regenerateTasklistStrategyNode(
        state: VersionPlanTasklistGraphStateAnnotationState
    ): Promise<VersionPlanTasklistGraphStatePatch> {
        try {
            const update = await runRegenerateTasklistStrategyStep({
                context: runtime.context,
                model: runtime.models.planning.model,
                modelStage: 'tasklist-strategy',
                modelTimeoutMs: runtime.models.planning.timeoutMs,
                state,
                userGoal: runtime.userGoal,
                writeChunk: runtime.writeChunk,
            })

            return {
                ...update,
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
                        summary: `任务清单策略已重新生成：${update.planning?.strategy?.granularity ?? 'unknown'}。`,
                    }),
                    ...createGraphRouteRuntimeUpdate({
                        fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
                        label: 'strategy_regenerated',
                        reason: '任务清单拆分策略已重新生成，进入第二次 Strategy Review。',
                        toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
                    }),
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
                textSummary: '任务清单拆分策略重新生成失败，本轮已安全停止。',
            }

            return {
                graph: {
                    ...createGraphNodeRuntimeUpdate({
                        nodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
                        summary: output.textSummary,
                    }),
                    ...createGraphRouteRuntimeUpdate({
                        fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
                        label: 'controlled_output_failed',
                        reason: output.textSummary,
                        toNodeId: END,
                    }),
                },
                output,
            }
        }
    }
}
