import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import type { VersionPlanTasklistAgentState } from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import { buildGraphDebugSummary } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-debug-summary'
import { createInitialVersionPlanTasklistGraphState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { createInitialVersionPlanTasklistAgentState } from '@/lib/ai/runtime/version-plan-tasklist-agent/state/state-machine'

const versionPlanReference = {
    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
} as const

function createGraphState() {
    const agentState: VersionPlanTasklistAgentState = {
        ...createInitialVersionPlanTasklistAgentState({
            runId: 'run-debug-summary-test',
            versionPlanReference,
        }),
        artifacts: {
            planning: {
                decision: {
                    reason: '版本方案足够完整，可以继续生成 tasklist。',
                    type: 'proceed_to_tasklist_strategy',
                },
                manualReviewItems: [
                    {
                        detail: '需要人工确认接口变化是否完整。',
                        severity: 'warning',
                        title: 'Interface Changes 较弱',
                    },
                ],
                optionalContext: {
                    content: '完整 optional context 原文不应进入 debug summary。',
                    contentPreview: 'optional context preview 不应进入 debug summary。',
                    location: 'local',
                    previewChars: 100,
                    resourceName: 'runtime-boundary.md',
                    serverId: 'project-docs-server',
                    status: 'completed',
                    uri: 'docs://architecture/runtime-boundary.md',
                },
                readiness: {
                    missingFields: ['Interface Changes'],
                    reason: 'readiness reason 不应进入 debug summary。',
                    status: 'needs_review',
                    weakFields: ['Risks'],
                },
                revisionEffect: {
                    finalDecision: 'final_with_manual_review_items',
                    fixedIssues: ['补齐执行纪律'],
                    improved: true,
                    remainingIssues: ['需要人工确认风险'],
                    scoreAfter: 96,
                    scoreBefore: 80,
                },
                strategy: {
                    expectedStepRange: [3, 5],
                    granularity: 'medium',
                    grouping: ['Graph State', 'Runner'],
                    priority: ['先 Graph State'],
                    reason: 'strategy reason 不应进入 debug summary。',
                },
                warningDisposition: {
                    fixNow: ['补齐执行纪律'],
                    manualReviewItems: [
                        {
                            detail: '需要人工确认回归范围。',
                            severity: 'warning',
                            title: '回归范围',
                        },
                        {
                            detail: '需要人工确认 release 表达。',
                            severity: 'info',
                            title: 'Release 表达',
                        },
                    ],
                    reason: 'warning disposition reason 不应进入 debug summary。',
                },
            },
            tasklistDraft: {
                content: '# 完整 tasklist draft 不应进入 debug summary',
                createdAtStep: 5,
                planUri: versionPlanReference.uri,
                targetVersion: 'v0.2.0',
                validationV1: {
                    blockingIssues: [],
                    missingSections: [],
                    revisionHints: ['补齐执行纪律'],
                    score: 80,
                    status: 'warning',
                    weakSections: [],
                },
                validationV2: {
                    blockingIssues: [],
                    missingSections: [],
                    revisionHints: [],
                    score: 96,
                    status: 'pass',
                    weakSections: [],
                },
                version: 2,
            },
            versionPlan: {
                content: '# 完整 version plan 原文不应进入 debug summary',
                reference: versionPlanReference,
                resourceName: 'v0.2.0-controlled-agent-graph.md',
                uri: versionPlanReference.uri,
            },
        },
        counters: {
            draftRevisions: 1,
            optionalContextReads: 1,
            steps: 10,
        },
    }

    return {
        ...createInitialVersionPlanTasklistGraphState({
            agentState,
            conversationId: 'conversation-debug-summary-test',
            runtimeConfig: getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_TASKLIST_AGENT_RUNTIME: 'graph',
                },
                'development'
            ),
            userGoal: '生成 v0.2.0 tasklist',
        }),
        graph: {
            checkpointMode: 'memory' as const,
            currentNode: 'emitFinalArtifact',
            lastRoute: {
                fromNodeId: 'decideWarningDisposition',
                label: 'no_auto_revision',
                reason: 'route reason 不应进入 debug summary。',
                toNodeId: 'evaluateRevisionEffect',
            },
            routes: [],
            runtimeMode: 'graph' as const,
            statePatchSummaries: [
                {
                    nodeId: 'draftTasklistV1',
                    summary: 'patch summary 不应进入 debug summary。',
                },
            ],
            visitedNodes: ['readVersionPlan', 'planningDecision', 'emitFinalArtifact'],
        },
        output: undefined,
    }
}

describe('runtime/version-plan-tasklist-agent graph debug summary', () => {
    it('只输出 Step 11 白名单字段', () => {
        expect(buildGraphDebugSummary(createGraphState())).toEqual({
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
            manualReviewItemCount: 1,
            maxDraftRevisions: 1,
            maxOptionalContextReads: 1,
            maxSteps: 12,
            optionalContext: {
                status: 'completed',
            },
            optionalContextReads: 1,
            readiness: {
                status: 'needs_review',
            },
            revisionEffect: {
                finalDecision: 'final_with_manual_review_items',
            },
            runId: 'run-debug-summary-test',
            runtimeMode: 'graph',
            stepCount: 10,
            strategy: {
                expectedStepRange: [3, 5],
                granularity: 'medium',
            },
            threadId: 'tasklist-agent:conversation-debug-summary-test:run-debug-summary-test',
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
        })
    })

    it('不输出完整 state、资源正文、草稿正文、tool output 或未脱敏原因文本', () => {
        const serializedSummary = JSON.stringify(buildGraphDebugSummary(createGraphState()))

        expect(serializedSummary).not.toContain('完整 version plan 原文')
        expect(serializedSummary).not.toContain('完整 optional context 原文')
        expect(serializedSummary).not.toContain('完整 tasklist draft')
        expect(serializedSummary).not.toContain('patch summary 不应进入 debug summary')
        expect(serializedSummary).not.toContain('route reason 不应进入 debug summary')
        expect(serializedSummary).not.toContain('strategy reason 不应进入 debug summary')
        expect(serializedSummary).not.toContain('warning disposition reason 不应进入 debug summary')
        expect(serializedSummary).not.toContain('revisionHints')
        expect(serializedSummary).not.toContain('blockingIssues')
        expect(serializedSummary).not.toContain('contentPreview')
        expect(serializedSummary).not.toContain('agentState')
        expect(serializedSummary).not.toContain('graphState')
    })
})
