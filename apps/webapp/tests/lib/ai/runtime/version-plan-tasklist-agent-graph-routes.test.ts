import { END } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'

import type { PlanningDecisionAction, WarningDisposition } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import {
    getRouteAfterPlanningDecision,
    routeAfterPlanningDecision,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-planning-decision'
import {
    getRouteAfterReadVersionPlan,
    routeAfterReadVersionPlan,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-read-version-plan'
import {
    getRouteAfterTasklistStrategy,
    routeAfterTasklistStrategy,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-tasklist-strategy'
import {
    getRouteAfterWarningDisposition,
    routeAfterWarningDisposition,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-warning-disposition'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-node-ids'
import {
    createInitialVersionPlanTasklistGraphRuntimeState,
    type VersionPlanTasklistGraphStateAnnotationState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { createInitialVersionPlanTasklistAgentState } from '@/lib/ai/runtime/version-plan-tasklist-agent/state/state-machine'

const planUri = 'docs://versions/v0.2.0-controlled-agent-graph.md'

const versionPlanReference = {
    id: planUri,
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: planUri,
} as const

function createGraphState(
    planning: VersionPlanTasklistGraphStateAnnotationState['agentState']['artifacts']['planning']
): VersionPlanTasklistGraphStateAnnotationState {
    const agentState = createInitialVersionPlanTasklistAgentState({
        runId: 'run-route-test',
        versionPlanReference,
    })

    return {
        agentState: {
            ...agentState,
            artifacts: {
                ...agentState.artifacts,
                planning,
            },
        },
        graph: createInitialVersionPlanTasklistGraphRuntimeState(),
        input: {
            planUri,
            userGoal: '生成 tasklist',
        },
        output: undefined,
        threadId: 'tasklist-agent:conversation-1:run-route-test',
    }
}

describe('runtime/version-plan-tasklist-agent graph read version plan route', () => {
    it('readVersionPlan 成功后进入 evaluatePlanReadiness', () => {
        const baseState = createGraphState({
            manualReviewItems: [],
        })
        const state = {
            ...baseState,
            agentState: {
                ...baseState.agentState,
                status: 'plan_read' as const,
            },
        }

        expect(routeAfterReadVersionPlan(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness)
        expect(getRouteAfterReadVersionPlan(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            label: 'read_succeeded',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluatePlanReadiness,
        })
    })

    it('readVersionPlan 失败后直接进入 END', () => {
        const state = {
            ...createGraphState({
                manualReviewItems: [],
            }),
            output: {
                errorMessage: 'docs unavailable',
                status: 'failed' as const,
                textSummary: '版本方案读取失败，未生成任务清单草稿。',
            },
        }

        expect(routeAfterReadVersionPlan(state)).toBe(END)
        expect(getRouteAfterReadVersionPlan(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            label: 'read_failed',
            reason: '版本方案读取失败，未生成任务清单草稿。',
            toNodeId: END,
        })
    })

    it('readVersionPlan 未产生成功或失败状态时 fail closed', () => {
        expect(() =>
            routeAfterReadVersionPlan(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('readVersionPlan 未产生可路由状态')
    })
})

describe('runtime/version-plan-tasklist-agent graph planning routes', () => {
    it.each([
        [
            {
                reason: '信息完整，可以继续。',
                type: 'proceed_to_tasklist_strategy',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
        ],
        [
            {
                reason: '需要补充上下文。',
                resourceUri: 'docs://architecture/runtime-boundary.md',
                type: 'read_optional_context',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readOptionalContext,
        ],
        [
            {
                question: '请补充目标。',
                reason: '缺少目标。',
                type: 'ask_clarification',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.askClarification,
        ],
        [
            {
                reason: '存在轻度不确定。',
                reviewItems: [
                    {
                        detail: '需要人工确认测试范围。',
                        severity: 'warning',
                        title: '测试范围',
                    },
                ],
                type: 'proceed_with_manual_review_items',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
        ],
        [
            {
                message: '当前输入不符合 Agent 边界。',
                reason: '越过边界。',
                type: 'stop_with_boundary_message',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.stopWithBoundaryMessage,
        ],
    ] as Array<[PlanningDecisionAction, string]>)('把 %s 路由到 %s', (decision, expectedNodeId) => {
        const state = createGraphState({
            decision,
            manualReviewItems: [],
        })

        expect(routeAfterPlanningDecision(state)).toBe(expectedNodeId)
        expect(getRouteAfterPlanningDecision(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
            label: decision.type,
            reason: decision.reason,
            toNodeId: expectedNodeId,
        })
    })

    it('缺少或未知 decision type 时 fail closed', () => {
        expect(() =>
            routeAfterPlanningDecision(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('缺少 PlanningDecisionAction')

        expect(() =>
            routeAfterPlanningDecision(
                createGraphState({
                    decision: {
                        reason: '不允许。',
                        type: 'write_tasklist_file',
                    } as unknown as PlanningDecisionAction,
                    manualReviewItems: [],
                })
            )
        ).toThrow('未知 PlanningDecisionAction')
    })

    it('受控 planner 输出失败后直接进入 END', () => {
        const state = {
            ...createGraphState({
                manualReviewItems: [],
            }),
            output: {
                status: 'stopped' as const,
                textSummary: '规划决策输出不符合受控 JSON schema，本轮已安全停止。',
            },
        }

        expect(routeAfterPlanningDecision(state)).toBe(END)
        expect(getRouteAfterPlanningDecision(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
            label: 'controlled_output_failed',
            toNodeId: END,
        })
    })
})

describe('runtime/version-plan-tasklist-agent graph tasklist strategy routes', () => {
    it('strategy 成功后进入 draftTasklistV1', () => {
        const baseState = createGraphState({
            manualReviewItems: [],
        })
        const state = {
            ...baseState,
            agentState: {
                ...baseState.agentState,
                status: 'strategy_decided' as const,
            },
        }

        expect(routeAfterTasklistStrategy(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1)
        expect(getRouteAfterTasklistStrategy(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            label: 'strategy_decided',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
        })
    })

    it('strategy 受控输出失败后直接进入 END', () => {
        const state = {
            ...createGraphState({
                manualReviewItems: [],
            }),
            output: {
                status: 'stopped' as const,
                textSummary: '任务清单拆分策略输出不符合受控 JSON schema，本轮已安全停止。',
            },
        }

        expect(routeAfterTasklistStrategy(state)).toBe(END)
        expect(getRouteAfterTasklistStrategy(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            label: 'controlled_output_failed',
            toNodeId: END,
        })
    })

    it('strategy 未产生成功或失败状态时 fail closed', () => {
        expect(() =>
            routeAfterTasklistStrategy(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('TasklistStrategy 未产生可路由状态')
    })
})

describe('runtime/version-plan-tasklist-agent graph warning routes', () => {
    it.each([
        [
            {
                fixNow: ['missing_steps'],
                manualReviewItems: [],
                reason: '存在需要自动修正的问题。',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
            'fix_now',
        ],
        [
            {
                fixNow: [],
                manualReviewItems: [
                    {
                        detail: '测试计划需要人工确认。',
                        severity: 'warning',
                        title: '测试计划较粗',
                    },
                ],
                reason: '只有人工复核项。',
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
            'no_auto_revision',
        ],
    ] as Array<[WarningDisposition, string, string]>)('根据 fixNow 路由到 %s', (warningDisposition, expectedNodeId, label) => {
        const state = createGraphState({
            manualReviewItems: [],
            warningDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(expectedNodeId)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            label,
            reason: warningDisposition.reason,
            toNodeId: expectedNodeId,
        })
    })

    it('缺少 warningDisposition 时 fail closed', () => {
        expect(() =>
            routeAfterWarningDisposition(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('缺少 WarningDisposition')
    })
})
