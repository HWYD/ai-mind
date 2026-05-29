/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AgentTracePanel } from '@/components/chat/message-list/parts/agent-trace-panel'
import type { AgentStepPart, ResourcePart } from '@/lib/ai/types/message'

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
        expect(screen.getByText('最终决策：需复核')).toBeTruthy()
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
})
