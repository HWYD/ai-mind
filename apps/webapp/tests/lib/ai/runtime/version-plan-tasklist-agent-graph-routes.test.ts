import { END } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import type {
    PlanningDecisionAction,
    VersionPlanTasklistPlanningArtifacts,
    WarningDisposition,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import {
    getRouteAfterPlanningDecision,
    routeAfterPlanningDecision,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-planning-decision'
import {
    getRouteAfterReadVersionPlan,
    routeAfterReadVersionPlan,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-read-version-plan'
import {
    getRouteAfterStrategyReview,
    routeAfterStrategyReview,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-strategy-review'
import {
    getRouteAfterTasklistRevisionReview,
    routeAfterTasklistRevisionReview,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/edges/route-after-tasklist-revision-review'
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
    createInitialVersionPlanTasklistGraphState,
    type VersionPlanTasklistGraphStateAnnotationState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'

const planUri = 'docs://versions/v0.2.0-controlled-agent-graph.md'

const versionPlanReference = {
    id: planUri,
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: planUri,
} as const

function createGraphState(planning: VersionPlanTasklistPlanningArtifacts): VersionPlanTasklistGraphStateAnnotationState {
    return {
        ...createInitialVersionPlanTasklistGraphState({
            conversationId: 'conversation-1',
            runId: 'run-route-test',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '生成 tasklist',
            versionPlanReference,
        }),
        output: undefined,
        planning,
    }
}

describe('runtime/version-plan-tasklist-agent graph read version plan route', () => {
    it('readVersionPlan 成功后进入 evaluatePlanReadiness', () => {
        const baseState = createGraphState({
            manualReviewItems: [],
        })
        const state = {
            ...baseState,
            source: {
                ...baseState.source,
                versionPlan: {
                    reference: versionPlanReference,
                    uri: planUri,
                },
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
    it('strategy 成功后进入 reviewTasklistStrategy', () => {
        const baseState = createGraphState({
            manualReviewItems: [],
        })
        const state: VersionPlanTasklistGraphStateAnnotationState = {
            ...baseState,
            planning: {
                ...baseState.planning,
                strategy: {
                    granularity: 'medium' as const,
                    grouping: 'by_phase' as const,
                    notes: '先做 runtime，再补测试。',
                    priorityFocus: ['core_runtime', 'tests'],
                    stepCountRange: '3-5' as const,
                },
            },
        }

        expect(routeAfterTasklistStrategy(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy)
        expect(getRouteAfterTasklistStrategy(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideTasklistStrategy,
            label: 'strategy_decided',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
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

describe('runtime/version-plan-tasklist-agent graph strategy review routes', () => {
    it.each([
        [
            {
                status: 'strategy_reviewed' as const,
                human: {
                    strategyReview: {
                        decision: {
                            type: 'approve' as const,
                        },
                        reviewRound: 1 as const,
                    },
                },
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.draftTasklistV1,
            'strategy_approved',
        ],
        [
            {
                status: 'strategy_feedback_received' as const,
                human: {
                    strategyReview: {
                        decision: {
                            feedback: '请调整策略。',
                            type: 'respond' as const,
                        },
                        reviewRound: 1 as const,
                    },
                },
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.regenerateTasklistStrategy,
            'strategy_feedback_received',
        ],
        [
            {
                status: 'stopped' as const,
                human: {
                    strategyReview: {
                        decision: {
                            reason: '不接受当前策略。',
                            type: 'reject' as const,
                        },
                        reviewRound: 1 as const,
                    },
                },
            },
            END,
            'strategy_rejected',
        ],
    ])('根据 strategy review 状态路由到 %s', ({ status, human }, expectedNodeId, label) => {
        const state = {
            ...createGraphState({
                manualReviewItems: [],
            }),
            execution: {
                ...createGraphState({
                    manualReviewItems: [],
                }).execution,
                status,
            },
            human,
        }

        expect(routeAfterStrategyReview(state)).toBe(expectedNodeId)
        expect(getRouteAfterStrategyReview(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistStrategy,
            label,
            toNodeId: expectedNodeId,
        })
    })

    it('strategy review 未产生可路由状态时 fail closed', () => {
        expect(() =>
            routeAfterStrategyReview(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('Strategy Review 未产生可路由状态')
    })
})

describe('runtime/version-plan-tasklist-agent graph warning routes', () => {
    const fixNowDisposition: WarningDisposition = {
        fixNow: ['missing_steps'],
        manualReviewItems: [],
        reason: '存在需要立即修订的问题。',
    }

    function createWarningRouteState(options: {
        draftRevisions?: number
        draftVersion: 1 | 2 | 3
        hasRevisionReview?: boolean
        warningDisposition: WarningDisposition
    }) {
        const baseState = createGraphState({
            manualReviewItems: [],
            warningDisposition: options.warningDisposition,
        })

        return {
            ...baseState,
            execution: {
                ...baseState.execution,
                counters: {
                    ...baseState.execution.counters,
                    draftRevisions: options.draftRevisions ?? 0,
                },
            },
            human: options.hasRevisionReview
                ? {
                      tasklistRevisionReview: {
                          decision: {
                              type: 'approve' as const,
                          },
                          reviewRound: 1 as const,
                      },
                  }
                : baseState.human,
            tasklist: {
                draft: {
                    content: '# Tasklist\n',
                    createdAtStep: 1,
                    planUri,
                    targetVersion: 'v0.2.0',
                    version: options.draftVersion,
                },
            },
        }
    }

    it('v1 fixNow 首次进入 Revision Review，而不是直接自动修订', () => {
        const state = createWarningRouteState({
            draftVersion: 1,
            warningDisposition: fixNowDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.decideWarningDisposition,
            label: 'fix_now_review_required',
            reason: fixNowDisposition.reason,
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
        })
    })

    it('v1 已完成 Revision Review 后才进入 v2 修订', () => {
        const state = createWarningRouteState({
            draftVersion: 1,
            hasRevisionReview: true,
            warningDisposition: fixNowDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            label: 'fix_now',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
        })
    })

    it('v2 fixNow 在预算内自动进入 v3 修订，不再二次 HITL', () => {
        const state = createWarningRouteState({
            draftRevisions: 1,
            draftVersion: 2,
            hasRevisionReview: true,
            warningDisposition: fixNowDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            label: 'fix_now_auto_revision',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV3,
        })
    })

    it('无 fixNow 时直接进入 revision effect，manual-only warning 不触发 HITL', () => {
        const warningDisposition: WarningDisposition = {
            fixNow: [],
            manualReviewItems: [
                {
                    detail: '测试计划需要人工确认。',
                    severity: 'warning',
                    title: '测试计划较粗',
                },
            ],
            reason: '只有人工复核项。',
        }
        const state = createWarningRouteState({
            draftVersion: 1,
            warningDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            label: 'no_auto_revision',
            reason: warningDisposition.reason,
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
        })
    })

    it('v3 或预算耗尽后不再生成 v4，直接进入 revision effect', () => {
        const state = createWarningRouteState({
            draftRevisions: 2,
            draftVersion: 3,
            hasRevisionReview: true,
            warningDisposition: fixNowDisposition,
        })

        expect(routeAfterWarningDisposition(state)).toBe(VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect)
        expect(getRouteAfterWarningDisposition(state)).toMatchObject({
            label: 'revision_budget_exhausted',
            toNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.evaluateRevisionEffect,
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

describe('runtime/version-plan-tasklist-agent graph tasklist revision review routes', () => {
    it.each([
        [
            {
                decision: {
                    type: 'approve' as const,
                },
                executionStatus: 'tasklist_revision_reviewed' as const,
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
            'tasklist_revision_approved',
        ],
        [
            {
                decision: {
                    feedback: '修订时强调 checkpoint resume 验证。',
                    type: 'respond' as const,
                },
                executionStatus: 'tasklist_revision_reviewed' as const,
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviseTasklistV2,
            'tasklist_revision_feedback_received',
        ],
        [
            {
                decision: {
                    markdown: '# Edited Tasklist\n',
                    type: 'edit' as const,
                },
                executionStatus: 'revised_v2' as const,
            },
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.validateTasklistV2,
            'tasklist_revision_edited',
        ],
        [
            {
                decision: {
                    reason: '不继续修订。',
                    type: 'reject' as const,
                },
                executionStatus: 'stopped' as const,
            },
            END,
            'tasklist_revision_rejected',
        ],
    ])('根据 revision review 决策路由到 %s', ({ decision, executionStatus }, expectedNodeId, label) => {
        const baseState = createGraphState({
            manualReviewItems: [],
        })
        const state = {
            ...baseState,
            execution: {
                ...baseState.execution,
                status: executionStatus,
            },
            human: {
                tasklistRevisionReview: {
                    decision,
                    reviewRound: 1 as const,
                },
            },
        }

        expect(routeAfterTasklistRevisionReview(state)).toBe(expectedNodeId)
        expect(getRouteAfterTasklistRevisionReview(state)).toMatchObject({
            fromNodeId: VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.reviewTasklistRevision,
            label,
            toNodeId: expectedNodeId,
        })
    })

    it('revision review 未产生可路由状态时 fail closed', () => {
        expect(() =>
            routeAfterTasklistRevisionReview(
                createGraphState({
                    manualReviewItems: [],
                })
            )
        ).toThrow('Tasklist Revision Review 未产生可路由状态')
    })
})
