import { describe, expect, it } from 'vitest'

import type { VersionPlanTasklistGraphStateAnnotationState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { buildTasklistFinalAnswerTextSummary } from '@/lib/ai/runtime/version-plan-tasklist-agent/stream/tasklist-agent-output'

function createFinalState(): VersionPlanTasklistGraphStateAnnotationState {
    return {
        execution: {
            agentName: 'version-plan-to-tasklist-agent',
            counters: {
                draftRevisions: 1,
                optionalContextReads: 0,
                steps: 6,
                strategyRegenerations: 0,
            },
            limits: {
                maxDraftRevisions: 2,
                maxOptionalContextReads: 1,
                maxSteps: 12,
                maxStrategyRegenerations: 1,
            },
            runId: 'run-tasklist-output',
            status: 'completed',
        },
        graph: {
            checkpointMode: 'memory',
            routes: [],
            runtimeMode: 'graph',
            statePatchSummaries: [],
            visitedNodes: [],
        },
        human: {},
        input: {
            planUri: 'demo://version-plans/v043-tool-agent-final-turn-memory.md',
            userGoal: '基于版本方案生成 tasklist 草稿',
        },
        output: {
            status: 'final',
            textSummary: '已输出任务清单草稿产物和结构校验摘要。',
        },
        planning: {
            manualReviewItems: [{ detail: '确认版本号是否正确。', title: '版本号确认' }],
            revisionEffect: {
                finalDecision: 'blocked',
                fixedIssues: ['补充了测试步骤'],
                improved: true,
                remainingIssues: ['仍需人工确认少量 weak sections'],
                scoreAfter: 92,
                scoreBefore: 88,
            },
        },
        source: {
            versionPlanReference: {
                id: 'demo://version-plans/v043-tool-agent-final-turn-memory.md',
                label: 'v043-tool-agent-final-turn-memory.md',
                source: 'local',
                type: 'resource',
                uri: 'demo://version-plans/v043-tool-agent-final-turn-memory.md',
            },
        },
        tasklist: {
            draft: {
                content: '# Tasklist Markdown\n\n- [ ] T001 不应进入最终文本摘要',
                planUri: 'demo://version-plans/v043-tool-agent-final-turn-memory.md',
                targetVersion: 'v0.4.3',
                validationV3: {
                    blockingIssues: ['仍需人工确认少量 weak sections'],
                    score: 92,
                    status: 'blocked',
                    weakSections: ['manual review'],
                },
                version: 3,
            },
        },
        threadId: 'tasklist-agent:conversation:run-tasklist-output',
    } as unknown as VersionPlanTasklistGraphStateAnnotationState
}

describe('runtime/version-plan-tasklist-agent output', () => {
    it('builds final answer text summary without tasklist artifact markdown', () => {
        const summary = buildTasklistFinalAnswerTextSummary(createFinalState())

        expect(summary).toContain('已生成基于显式引用 version plan 的任务清单草稿')
        expect(summary).toContain('## 结构校验结论')
        expect(summary).toContain('## 人工确认点')
        expect(summary).toContain('当前任务清单草稿仍未通过结构校验')
        expect(summary).not.toContain('# Tasklist Markdown')
        expect(summary).not.toContain('T001 不应进入最终文本摘要')
    })
})
