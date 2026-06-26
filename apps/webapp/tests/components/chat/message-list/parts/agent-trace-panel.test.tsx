/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentTracePanel } from '@/components/chat/message-list/parts/agent-trace-panel'
import type { AgentStepPart, ResourcePart, ToolPart } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
})

function createGraphAgentStepPart(overrides?: Partial<AgentStepPart>): AgentStepPart {
    return {
        agentName: 'version-plan-to-tasklist-agent',
        graph: {
            nodes: [],
            routes: [],
            runtime: 'LangGraph',
        },
        runId: 'run-trace-test',
        status: 'completed',
        type: 'agent-step',
        ...overrides,
    }
}

describe('AgentTracePanel', () => {
    it('没有 graph timeline 或 debug summary 时不渲染面板', () => {
        const { container } = render(
            <AgentTracePanel
                part={{
                    agentName: 'version-plan-to-tasklist-agent',
                    graph: {
                        nodes: [],
                        routes: [],
                        runtime: 'LangGraph',
                    },
                    runId: 'run-no-graph',
                    status: 'completed',
                    type: 'agent-step',
                }}
            />
        )

        expect(container.firstChild).toBeNull()
    })

    it('展示 LangGraph node timeline、route 和 state patch 摘要', () => {
        const detailParts: Array<ResourcePart | ToolPart> = [
            {
                id: 'version-plan-resource',
                resourceName: 'v0.2.0-controlled-agent-graph.md',
                serverId: 'project-docs-server',
                status: 'completed',
                type: 'resource',
                uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
            },
            {
                id: 'validate-v1',
                input: '{}',
                output: JSON.stringify({
                    score: 90,
                    status: 'warning',
                }),
                status: 'completed',
                toolName: 'validate_tasklist_structure',
                type: 'tool',
            },
        ]

        const { container } = render(
            <AgentTracePanel
                detailParts={detailParts}
                part={createGraphAgentStepPart({
                    graph: {
                        nodes: [
                            {
                                nodeId: 'readVersionPlan',
                                partId: 'graph-read',
                                patchSummaries: ['已读取 version plan，目标版本 v0.2.0。'],
                                status: 'completed',
                                stepIndex: 1,
                                summary: '已读取 version plan，目标版本 v0.2.0。',
                                title: '读取版本方案',
                            },
                            {
                                nodeId: 'planningDecision',
                                partId: 'graph-decision',
                                patchSummaries: ['规划决策：proceed_to_tasklist_strategy。'],
                                status: 'completed',
                                stepIndex: 2,
                                summary: '规划决策：proceed_to_tasklist_strategy。',
                                title: '规划决策',
                            },
                            {
                                nodeId: 'validateTasklistV1',
                                partId: 'graph-validate-v1',
                                patchSummaries: ['v1 结构校验：warning，评分 90。'],
                                severity: 'warning',
                                status: 'completed',
                                stepIndex: 3,
                                summary: 'v1 结构校验：warning，评分 90。',
                                tags: ['score: 90', 'missing: 2'],
                                title: '校验 v1 草稿',
                            },
                            {
                                nodeId: 'decideWarningDisposition',
                                partId: 'graph-warning',
                                patchSummaries: ['warning 处理：fixNow 1，manualReview 2。'],
                                severity: 'warning',
                                status: 'completed',
                                stepIndex: 4,
                                tags: ['fixNow: 1', 'manualReview: 2'],
                                title: '决定 warning 处理',
                            },
                        ],
                        routes: [
                            {
                                fromNodeId: 'planningDecision',
                                reason: '输入已满足任务清单生成条件。',
                                routeLabel: 'proceed_to_tasklist_strategy',
                                toNodeId: 'decideTasklistStrategy',
                            },
                        ],
                        runtime: 'LangGraph',
                    },
                })}
            />
        )

        expect(screen.getByText('Agent Graph 执行过程')).toBeTruthy()
        expect(screen.getByText('LangGraph')).toBeTruthy()
        expect(screen.getByText('4 个节点')).toBeTruthy()
        expect(screen.getByText('读取版本方案')).toBeTruthy()
        expect(screen.getByText('readVersionPlan')).toBeTruthy()
        expect(screen.getByText('继续拆分策略')).toBeTruthy()
        expect(screen.getByText('decideTasklistStrategy')).toBeTruthy()
        expect(screen.getByText('docs://versions/v0.2.0-controlled-agent-graph.md：已完成')).toBeTruthy()
        expect(screen.getByText('validate_tasklist_structure：警告，评分 90')).toBeTruthy()
        expect(screen.getByText('评分：90')).toBeTruthy()
        expect(screen.getByText('自动修正：1')).toBeTruthy()
        expect(screen.getByText('人工复核：2')).toBeTruthy()
        expect(screen.getAllByText('已读取 version plan，目标版本 v0.2.0。')).toHaveLength(1)
        expect(screen.getByText('校验提醒处理：自动修正 1，人工复核 2。')).toBeTruthy()
        expect(screen.queryByText('执行规划决策')).toBeNull()

        const warningRow = Array.from(container.querySelectorAll('div')).find(
            element =>
                typeof element.className === 'string' &&
                element.className.includes('border-amber-200/70') &&
                element.textContent?.includes('校验 v1 草稿')
        )

        expect(container.querySelector('svg.text-amber-500')).toBeTruthy()
        expect(warningRow).toBeTruthy()
    })

    it('将 graph 校验摘要里的 fail 本地化为失败', () => {
        const { container } = render(
            <AgentTracePanel
                part={createGraphAgentStepPart({
                    graph: {
                        nodes: [
                            {
                                nodeId: 'validateTasklistV1',
                                partId: 'graph-validate-v1',
                                patchSummaries: ['v1 结构校验：fail，评分 45。'],
                                severity: 'error',
                                status: 'completed',
                                stepIndex: 1,
                                summary: 'v1 结构校验：fail，评分 45。',
                                title: '校验 v1 草稿',
                            },
                        ],
                        routes: [],
                        runtime: 'LangGraph',
                    },
                })}
            />
        )

        expect(screen.getByText('v1 结构校验：失败，评分 45。')).toBeTruthy()
        expect(screen.queryByText('v1 结构校验：fail，评分 45。')).toBeNull()
        expect(container.querySelector('svg.text-rose-500')).toBeTruthy()
    })

    it('展示 HITL paused 节点和人工审核路由标签', () => {
        const { container } = render(
            <AgentTracePanel
                part={createGraphAgentStepPart({
                    graph: {
                        nodes: [
                            {
                                nodeId: 'reviewTasklistStrategy',
                                partId: 'graph-review-strategy',
                                patchSummaries: ['等待用户确认策略。'],
                                status: 'paused',
                                stepIndex: 3,
                                summary: '等待用户确认策略。',
                                title: '确认任务清单生成策略',
                            },
                        ],
                        routes: [
                            {
                                fromNodeId: 'reviewTasklistStrategy',
                                routeLabel: 'strategy_approved',
                                toNodeId: 'draftTasklistV1',
                            },
                        ],
                        runtime: 'LangGraph',
                    },
                    status: 'paused',
                })}
            />
        )

        expect(screen.getByText('等待人工审核')).toBeTruthy()
        expect(screen.getByText('确认任务清单生成策略')).toBeTruthy()
        expect(screen.getByText('确认策略')).toBeTruthy()
        expect(container.querySelector('svg.text-sky-500')).toBeTruthy()
        expect(
            Array.from(container.querySelectorAll('div')).some(
                element =>
                    typeof element.className === 'string' &&
                    element.className.includes('border-sky-200') &&
                    element.textContent?.includes('确认任务清单生成策略')
            )
        ).toBe(true)
    })

    it('graph debug summary 存在时展示折叠 Debug 分组', () => {
        render(
            <AgentTracePanel
                part={createGraphAgentStepPart({
                    graph: {
                        debugSummary: {
                            checkpointMode: 'memory',
                            currentNode: 'emitFinalArtifact',
                            decision: {
                                type: 'proceed_to_tasklist_strategy',
                            },
                            draftRevisions: 1,
                            lastRoute: {
                                fromNodeId: 'decideWarningDisposition',
                                label: 'no_auto_revision',
                                toNodeId: 'evaluateRevisionEffect',
                            },
                            manualReviewItemCount: 2,
                            maxDraftRevisions: 1,
                            maxOptionalContextReads: 1,
                            maxStrategyRegenerations: 1,
                            maxSteps: 12,
                            optionalContext: {
                                status: 'completed',
                            },
                            optionalContextReads: 1,
                            readiness: {
                                status: 'ready',
                            },
                            revisionEffect: {
                                finalDecision: 'final_with_manual_review_items',
                            },
                            runId: 'run-trace-test',
                            runtimeMode: 'graph',
                            stepCount: 8,
                            strategy: {
                                expectedStepRange: [3, 5],
                                granularity: 'medium',
                            },
                            strategyRegenerations: 1,
                            threadId: 'tasklist-agent:conversation-1:run-trace-test',
                            validationV1: {
                                score: 80,
                                status: 'warning',
                            },
                            validationV2: {
                                score: 96,
                                status: 'pass',
                            },
                            validationV3: {
                                score: 98,
                                status: 'pass',
                            },
                            visitedNodes: ['readVersionPlan', 'planningDecision', 'emitFinalArtifact'],
                            warningDisposition: {
                                fixNowCount: 1,
                                manualReviewItemCount: 2,
                            },
                        },
                        nodes: [],
                        routes: [],
                        runtime: 'LangGraph',
                    },
                })}
            />
        )

        expect(screen.getByText('Agent Graph 执行过程')).toBeTruthy()
        expect(screen.queryByText('Run')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: 'Debug' }))

        expect(screen.getByText('Run')).toBeTruthy()
        expect(screen.getByText('Route')).toBeTruthy()
        expect(screen.getByText('Planning')).toBeTruthy()
        expect(screen.getByText('Validation')).toBeTruthy()
        expect(screen.getByText('Limits')).toBeTruthy()
        expect(screen.getByText('Checkpoint')).toBeTruthy()
        expect(screen.getByText('tasklist-agent:conversation-1:run-trace-test')).toBeTruthy()
        expect(screen.getByText('readVersionPlan → planningDecision → emitFinalArtifact')).toBeTruthy()
        expect(screen.getByText('decideWarningDisposition → 无需自动修正 → evaluateRevisionEffect')).toBeTruthy()
        expect(screen.getByText('继续生成任务清单')).toBeTruthy()
        expect(screen.getByText('中等粒度')).toBeTruthy()
        expect(screen.getByText('validationV3.status')).toBeTruthy()
        expect(screen.getByText('strategyRegenerations / maxStrategyRegenerations')).toBeTruthy()
        expect(screen.getByText('8 / 12')).toBeTruthy()
        expect(screen.getByText('memory')).toBeTruthy()
    })
})
