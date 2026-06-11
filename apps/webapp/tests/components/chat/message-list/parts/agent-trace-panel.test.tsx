/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentTracePanel } from '@/components/chat/message-list/parts/agent-trace-panel'
import type { AgentStepPart, ResourcePart, ToolPart } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
})

function createAgentStepPart(steps: AgentStepPart['steps']): AgentStepPart {
    return {
        agentName: 'version-plan-to-tasklist-agent',
        runId: 'run-trace-test',
        status: 'completed',
        steps,
        type: 'agent-step',
    }
}

describe('AgentTracePanel', () => {
    it('展示 planner lite decision、strategy、disposition 和 revision effect 标签摘要', () => {
        render(
            <AgentTracePanel
                part={createAgentStepPart([
                    {
                        actionType: 'planning_decision',
                        partId: 'decision',
                        status: 'completed',
                        stepIndex: 1,
                        summary: '需要补读 1 个白名单上下文。',
                        tags: ['action: read_optional_context'],
                        title: '执行 Planning Decision',
                    },
                    {
                        actionType: 'decide_tasklist_strategy',
                        partId: 'strategy',
                        status: 'completed',
                        stepIndex: 2,
                        summary: '拆分粒度 medium，预计 3-5 个 Step。',
                        tags: ['granularity: medium', 'range: 3-5'],
                        title: '判断 tasklist 拆分策略',
                    },
                    {
                        actionType: 'decide_warning_disposition',
                        partId: 'disposition',
                        status: 'completed',
                        stepIndex: 3,
                        summary: '发现 1 类需要立即自动修正的问题，2 项转为人工复核。',
                        tags: ['fixNow: 1', 'manualReview: 2'],
                        title: '判断 warning 处理方式',
                    },
                    {
                        actionType: 'evaluate_revision_effect',
                        partId: 'revision-effect',
                        status: 'completed',
                        stepIndex: 4,
                        summary: '评分 80 -> 95，修正有效。',
                        tags: ['improved: true', 'decision: final_with_manual_review_items', 'remaining: 1'],
                        title: '评估修正效果',
                    },
                ])}
            />
        )

        expect(screen.getByText('执行规划决策')).toBeTruthy()
        expect(screen.queryByText('执行 Planning Decision')).toBeNull()
        expect(screen.getByText('拆分粒度 中等粒度，预计 3-5 个 Step。')).toBeTruthy()
        expect(screen.getByText('决策：读取补充上下文')).toBeTruthy()
        expect(screen.getByText('拆分粒度：中等粒度')).toBeTruthy()
        expect(screen.getByText('Step 范围：3-5')).toBeTruthy()
        expect(screen.getByText('自动修正：1')).toBeTruthy()
        expect(screen.getByText('人工复核：2')).toBeTruthy()
        expect(screen.getByText('修正有效')).toBeTruthy()
        expect(screen.getByText('最终决策：需人工复核后采用')).toBeTruthy()
        expect(screen.getByText('剩余问题：1')).toBeTruthy()
    })

    it('展示 ask / stop 的提前结束状态标签', () => {
        render(
            <AgentTracePanel
                part={createAgentStepPart([
                    {
                        actionType: 'planning_decision',
                        partId: 'ask',
                        severity: 'warning',
                        status: 'completed',
                        stepIndex: 1,
                        summary: '缺少关键可补充信息，本轮输出澄清问题后结束。',
                        tags: ['action: ask_clarification'],
                        title: '执行 Planning Decision',
                    },
                    {
                        actionType: 'planning_decision',
                        partId: 'stop',
                        severity: 'warning',
                        status: 'completed',
                        stepIndex: 2,
                        summary: '当前输入不符合 Agent 边界，本轮停止。',
                        tags: ['action: stop_with_boundary_message'],
                        title: '执行 Planning Decision',
                    },
                ])}
            />
        )

        expect(screen.getByText('决策：需要澄清')).toBeTruthy()
        expect(screen.getByText('决策：边界停止')).toBeTruthy()
    })

    it('把 optional context 资源读取结果贴回 read_resource step', () => {
        const detailParts: ResourcePart[] = [
            {
                id: 'resource-success',
                resourceName: 'runtime-boundary.md',
                serverId: 'project-docs-server',
                status: 'completed',
                type: 'resource',
                uri: 'docs://architecture/runtime-boundary.md',
            },
            {
                error: 'docs unavailable',
                id: 'resource-failed',
                resourceName: 'latest-context',
                serverId: 'project-assistant-service',
                status: 'failed',
                type: 'resource',
                uri: 'project://latest-context',
            },
        ]

        render(
            <AgentTracePanel
                detailParts={detailParts}
                part={createAgentStepPart([
                    {
                        actionType: 'read_resource',
                        partId: 'read-success',
                        status: 'completed',
                        stepIndex: 1,
                        summary: '已读取补充上下文 runtime-boundary.md。',
                        tags: ['docs://architecture/runtime-boundary.md'],
                        title: '读取补充上下文',
                    },
                    {
                        actionType: 'read_resource',
                        partId: 'read-failed',
                        severity: 'warning',
                        status: 'completed',
                        stepIndex: 2,
                        summary: '补充上下文读取失败，已降级继续。',
                        tags: ['project://latest-context', 'degraded'],
                        title: '读取补充上下文',
                    },
                ])}
            />
        )

        expect(screen.getByText('docs://architecture/runtime-boundary.md：已完成')).toBeTruthy()
        expect(screen.getByText('project://latest-context：失败')).toBeTruthy()
    })

    it('展示 LangGraph node timeline、route 和 state patch 摘要，并隐藏重复的旧 step timeline', () => {
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

        render(
            <AgentTracePanel
                detailParts={detailParts}
                part={{
                    ...createAgentStepPart([
                        {
                            actionType: 'planning_decision',
                            partId: 'legacy-decision',
                            status: 'completed',
                            stepIndex: 1,
                            summary: '继续生成任务清单。',
                            tags: ['action: proceed_to_tasklist_strategy'],
                            title: '执行 Planning Decision',
                        },
                        {
                            actionType: 'call_tool',
                            partId: 'legacy-validate-v1',
                            severity: 'warning',
                            status: 'completed',
                            stepIndex: 2,
                            summary: '结构校验发现 2 个可改进事项。',
                            tags: ['score: 90', 'missing: 2'],
                            title: '校验任务清单结构 v1',
                        },
                        {
                            actionType: 'decide_warning_disposition',
                            partId: 'legacy-warning',
                            severity: 'warning',
                            status: 'completed',
                            stepIndex: 3,
                            summary: '发现 1 类需要立即自动修正的问题，2 项转为人工复核。',
                            tags: ['fixNow: 1', 'manualReview: 2'],
                            title: '判断 warning 处理方式',
                        },
                    ]),
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
                                status: 'completed',
                                stepIndex: 3,
                                summary: 'v1 结构校验：warning，评分 90。',
                                title: '校验 v1 草稿',
                            },
                            {
                                nodeId: 'decideWarningDisposition',
                                partId: 'graph-warning',
                                patchSummaries: ['warning 处理：fixNow 1，manualReview 2。'],
                                status: 'completed',
                                stepIndex: 4,
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
                }}
            />
        )

        expect(screen.getByText('Agent Graph 执行过程')).toBeTruthy()
        expect(screen.getByText('LangGraph')).toBeTruthy()
        expect(screen.getByText('4 个节点')).toBeTruthy()
        expect(screen.queryByText('Graph 节点')).toBeNull()
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
    })

    it('将 graph 校验摘要里的 fail 本地化为失败', () => {
        render(
            <AgentTracePanel
                part={{
                    ...createAgentStepPart([]),
                    graph: {
                        nodes: [
                            {
                                nodeId: 'validateTasklistV1',
                                partId: 'graph-validate-v1',
                                patchSummaries: ['v1 结构校验：fail，评分 45。'],
                                status: 'completed',
                                stepIndex: 1,
                                summary: 'v1 结构校验：fail，评分 45。',
                                title: '校验 v1 草稿',
                            },
                        ],
                        routes: [],
                        runtime: 'LangGraph',
                    },
                }}
            />
        )

        expect(screen.getByText('v1 结构校验：失败，评分 45。')).toBeTruthy()
        expect(screen.queryByText('v1 结构校验：fail，评分 45。')).toBeNull()
    })

    it('只在 graph debug summary 存在时展示折叠 Debug 分组', () => {
        render(
            <AgentTracePanel
                part={{
                    ...createAgentStepPart([
                        {
                            actionType: 'planning_decision',
                            partId: 'legacy-decision',
                            status: 'completed',
                            stepIndex: 1,
                            summary: '继续生成任务清单。',
                            title: '执行 Planning Decision',
                        },
                    ]),
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
                            threadId: 'tasklist-agent:conversation-1:run-trace-test',
                            validationV1: {
                                score: 80,
                                status: 'warning',
                            },
                            validationV2: {
                                score: 96,
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
                }}
            />
        )

        expect(screen.getByText('Agent Graph 执行过程')).toBeTruthy()
        expect(screen.getByText('执行规划决策')).toBeTruthy()
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
        expect(screen.getByText('8 / 12')).toBeTruthy()
        expect(screen.getByText('memory')).toBeTruthy()
    })
})
