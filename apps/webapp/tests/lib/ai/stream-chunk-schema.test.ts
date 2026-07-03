import { describe, expect, it } from 'vitest'

import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'

describe('chatStreamChunkSchema artifact chunks', () => {
    it('接受合法 artifact chunk', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-start',
                artifactId: 'artifact-tasklist',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                metadata: {
                    generatedFrom: 'demo://version-plans/v0.1.1.md',
                    revision: 2,
                    targetVersion: 'v0.1.1',
                    validated: true,
                },
                sourceStepId: 'final-step',
                title: 'v0.1.1 Tasklist 草稿',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-delta',
                artifactId: 'artifact-tasklist',
                delta: '# Tasklist',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-end',
                artifactId: 'artifact-tasklist',
                metadata: {
                    charCount: 10,
                    sectionCount: 1,
                },
                status: 'completed',
            }).success
        ).toBe(true)
    })

    it('拒绝非法 artifactKind 和 status', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-start',
                artifactId: 'artifact-tasklist',
                artifactKind: 'tasklist_draft',
                artifactType: 'text',
                format: 'markdown',
                title: 'Tasklist',
            }).success
        ).toBe(false)
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'artifact-end',
                artifactId: 'artifact-tasklist',
                status: 'streaming',
            }).success
        ).toBe(false)
    })
})

describe('chatStreamChunkSchema thread memory status chunks', () => {
    it('accepts safe thread-memory-status chunks', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'thread-memory-status',
                status: 'started',
                message: '上下自动压缩中',
            }).success
        ).toBe(true)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'thread-memory-status',
                status: 'succeeded',
                message: '上下文已自动压缩',
                summaryLength: 120,
                pinnedDecisionCount: 2,
            }).success
        ).toBe(true)
    })

    it('rejects raw-like or malformed thread-memory-status chunks', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'thread-memory-status',
                status: 'running',
                message: '上下自动压缩中',
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'thread-memory-status',
                status: 'failed',
                message: '',
                rawError: 'provider timeout',
            }).success
        ).toBe(false)
    })
})

describe('chatStreamChunkSchema graph chunks', () => {
    it('接受合法 graph event chunk', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-node-start',
                runId: 'run-1',
                stepIndex: 1,
                threadId: 'tasklist-agent:conversation-1:run-1',
                title: '读取版本方案',
                type: 'agent-graph-node-start',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 8,
                nodeId: 'readVersionPlan',
                partId: 'graph-node-end',
                runId: 'run-1',
                severity: 'info',
                status: 'completed',
                summary: '已读取 version plan。',
                tags: ['read_resource'],
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-node-end',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 5,
                nodeId: 'reviewTasklistStrategy',
                partId: 'graph-node-paused',
                runId: 'run-1',
                severity: 'info',
                status: 'paused',
                summary: 'Graph paused for human review.',
                tags: ['status: interrupted'],
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-node-end',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                fromNodeId: 'readVersionPlan',
                partId: 'graph-route',
                reason: '读取成功。',
                routeLabel: 'read_succeeded',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                toNodeId: 'evaluatePlanReadiness',
                type: 'agent-graph-route',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-state-patch',
                patchSummary: '已读取 version plan。',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-state-patch',
            }).success
        ).toBe(true)
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                partId: 'graph-debug-summary',
                runId: 'run-1',
                summary: {
                    checkpointMode: 'postgres',
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
                        status: 'ready',
                    },
                    revisionEffect: {
                        finalDecision: 'final_with_manual_review_items',
                    },
                    runId: 'run-1',
                    runtimeMode: 'graph',
                    stepCount: 10,
                    strategy: {
                        expectedStepRange: [3, 5],
                        granularity: 'medium',
                    },
                    threadId: 'tasklist-agent:conversation-1:run-1',
                    validationV1: {
                        score: 80,
                        status: 'warning',
                    },
                    validationV2: {
                        score: 96,
                        status: 'pass',
                    },
                    visitedNodes: ['readVersionPlan', 'emitFinalArtifact'],
                    warningDisposition: {
                        fixNowCount: 1,
                        manualReviewItemCount: 2,
                    },
                },
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-debug-summary',
            }).success
        ).toBe(true)
    })

    it('拒绝把完整 state patch object 放入 graph state patch chunk', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-state-patch',
                patchSummary: {
                    agentState: {
                        artifacts: {
                            tasklistDraft: '# Full draft should not be streamed here',
                        },
                    },
                },
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-state-patch',
            }).success
        ).toBe(false)
    })

    it('拒绝 graph debug summary 携带完整 state 或非白名单字段', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                partId: 'graph-debug-summary',
                runId: 'run-1',
                summary: {
                    agentState: {
                        artifacts: {
                            tasklistDraft: '# Full draft should not be streamed here',
                        },
                    },
                    checkpointMode: 'off',
                    draftRevisions: 0,
                    manualReviewItemCount: 0,
                    maxDraftRevisions: 1,
                    maxOptionalContextReads: 1,
                    maxSteps: 12,
                    optionalContextReads: 0,
                    runId: 'run-1',
                    runtimeMode: 'graph',
                    stepCount: 1,
                    threadId: 'tasklist-agent:conversation-1:run-1',
                    visitedNodes: ['readVersionPlan'],
                },
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-debug-summary',
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                partId: 'graph-debug-summary',
                runId: 'run-1',
                summary: {
                    checkpointMode: 'off',
                    draftRevisions: 0,
                    manualReviewItemCount: 0,
                    maxDraftRevisions: 1,
                    maxOptionalContextReads: 1,
                    maxSteps: 12,
                    optionalContextReads: 0,
                    readiness: {
                        reason: '完整 reason 不应进入 debug summary',
                        status: 'ready',
                    },
                    runId: 'run-1',
                    runtimeMode: 'graph',
                    stepCount: 1,
                    threadId: 'tasklist-agent:conversation-1:run-1',
                    visitedNodes: ['readVersionPlan'],
                },
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-debug-summary',
            }).success
        ).toBe(false)
    })
})

describe('chatStreamChunkSchema workflow progress chunks', () => {
    it('accepts safe workflow progress chunks', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-start',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                workflowKind: 'delivery-chain',
                title: '正在生成交付计划...',
                startedAt: 1_719_739_200_000,
            }).success
        ).toBe(true)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-step',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                stepId: 'plan',
                title: '方案规划',
                status: 'running',
                summary: '开始方案规划',
                details: ['调用模型：生成方案 (plan)'],
                startedAt: 1_719_739_200_100,
            }).success
        ).toBe(true)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-end',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                status: 'completed',
                summary: '已处理 6s',
                durationMs: 6_000,
                endedAt: 1_719_739_206_000,
            }).success
        ).toBe(true)
    })

    it('rejects workflow progress chunks with raw-like leaked fields', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-step',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                stepId: 'load',
                title: '读取上下文',
                status: 'failed',
                details: ['读取文件：requirement.md'],
                graphState: {
                    visitedNodes: ['loadDeliveryChainContext'],
                },
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-step',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                stepId: 'review',
                title: '交付评审',
                status: 'failed',
                failureMessage: '',
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                type: 'workflow-progress-end',
                partId: 'workflow-progress-1',
                workflowId: 'delivery-chain-run-1',
                status: 'running',
            }).success
        ).toBe(false)
    })
})

describe('chatStreamChunkSchema HITL chunks', () => {
    const strategyPayload = {
        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
        data: {
            planUri: 'demo://version-plans/v0.3.0.md',
            reviewRound: 1,
            strategy: {
                granularity: 'medium',
                grouping: 'by_phase',
                priorityFocus: ['core_runtime', 'tests'],
                stepCountRange: '5-8',
            },
            targetVersion: 'v0.3.0',
        },
        kind: 'strategy_review',
        nodeName: 'reviewTasklistStrategy',
        runId: 'run-1',
        threadId: 'tasklist-agent:conversation-1:run-1',
    }

    const revisionPayload = {
        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
        data: {
            fixNow: ['Add missing verification section.'],
            markdown: '# v0.3.0 Tasklist\n\n## Step 1\n- [ ] Implement HITL',
            reviewRound: 1,
            revision: 1,
            validation: {
                blockingIssues: [
                    {
                        code: 'missing_verification',
                        message: 'Verification is missing.',
                        suggestion: 'Add verification checklist.',
                    },
                ],
                score: 82,
                status: 'warning',
                weakSections: [
                    {
                        autoFixable: true,
                        code: 'step_missing_verification',
                        issue: 'Step lacks verification.',
                        section: 'Step 1',
                        suggestion: 'Add targeted tests.',
                    },
                ],
            },
        },
        kind: 'tasklist_revision_review',
        nodeName: 'reviewTasklistRevision',
        runId: 'run-1',
        threadId: 'tasklist-agent:conversation-1:run-1',
    }

    it('accepts strategy interrupt, revision interrupt and resume chunks', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                interruptKind: 'strategy_review',
                payload: strategyPayload,
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            }).success
        ).toBe(true)

        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-2',
                interruptKind: 'tasklist_revision_review',
                payload: revisionPayload,
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            }).success
        ).toBe(true)

        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-resume',
            }).success
        ).toBe(true)
    })

    it('rejects mismatched interrupt kind, leaked state and extra checkpoint fields', () => {
        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                interruptKind: 'tasklist_revision_review',
                payload: strategyPayload,
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                checkpoint: {
                    raw: 'checkpoint should not be streamed',
                },
                interruptId: 'interrupt-1',
                interruptKind: 'strategy_review',
                payload: strategyPayload,
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            }).success
        ).toBe(false)

        expect(
            chatStreamChunkSchema.safeParse({
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                interruptKind: 'strategy_review',
                payload: {
                    ...strategyPayload,
                    data: {
                        ...strategyPayload.data,
                        graphState: {
                            artifacts: {
                                tasklistDraft: '# Full draft should not be leaked here',
                            },
                        },
                    },
                },
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            }).success
        ).toBe(false)
    })
})
