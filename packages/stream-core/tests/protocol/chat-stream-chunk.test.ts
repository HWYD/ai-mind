import { describe, expect, it } from 'vitest'

import type { ChatStreamChunk } from '../../src/protocol'

describe('chat stream graph chunks', () => {
    it('accepts graph node, route and state patch chunks in the protocol union', () => {
        const chunks = [
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-node-start',
                runId: 'run-1',
                stepIndex: 1,
                threadId: 'tasklist-agent:conversation-1:run-1',
                title: '读取版本方案',
                type: 'agent-graph-node-start',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 12,
                nodeId: 'readVersionPlan',
                partId: 'graph-node-end',
                runId: 'run-1',
                severity: 'info',
                status: 'completed',
                summary: '已读取 version plan。',
                tags: ['read_resource'],
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-node-end',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 5,
                nodeId: 'reviewTasklistStrategy',
                partId: 'graph-node-paused',
                runId: 'run-1',
                severity: 'info',
                status: 'paused',
                summary: 'Graph 已暂停，等待人工审核后 resume。',
                tags: ['status: interrupted'],
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-node-end',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                fromNodeId: 'readVersionPlan',
                partId: 'graph-route',
                reason: '读取成功。',
                routeLabel: 'read_succeeded',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                toNodeId: 'evaluatePlanReadiness',
                type: 'agent-graph-route',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-state-patch',
                patchSummary: '已读取 version plan。',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-state-patch',
            },
            {
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
                    optionalContextReads: 0,
                    runId: 'run-1',
                    runtimeMode: 'graph',
                    stepCount: 8,
                    threadId: 'tasklist-agent:conversation-1:run-1',
                    visitedNodes: ['readVersionPlan', 'emitFinalArtifact'],
                },
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-graph-debug-summary',
            },
        ] satisfies ChatStreamChunk[]

        expect(chunks.map(chunk => chunk.type)).toEqual([
            'agent-graph-node-start',
            'agent-graph-node-end',
            'agent-graph-node-end',
            'agent-graph-route',
            'agent-graph-state-patch',
            'agent-graph-debug-summary',
        ])
    })
})

describe('chat stream HITL chunks', () => {
    it('accepts generic interrupt and resume chunks in the protocol union', () => {
        const chunks = [
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                interruptKind: 'strategy_review',
                payload: {
                    kind: 'strategy_review',
                    nodeName: 'reviewTasklistStrategy',
                    runId: 'run-1',
                    threadId: 'tasklist-agent:conversation-1:run-1',
                },
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-interrupt',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-1',
                interruptId: 'interrupt-1',
                runId: 'run-1',
                threadId: 'tasklist-agent:conversation-1:run-1',
                type: 'agent-resume',
            },
        ] satisfies ChatStreamChunk[]

        expect(chunks.map(chunk => chunk.type)).toEqual(['agent-interrupt', 'agent-resume'])
    })
})

describe('chat stream workflow progress chunks', () => {
    it('accepts workflow progress chunks in the protocol union', () => {
        const chunks = [
            {
                partId: 'workflow-progress-1',
                startedAt: 1_719_739_200_000,
                title: '正在生成交付计划...',
                type: 'workflow-progress-start',
                workflowId: 'delivery-chain-run-1',
                workflowKind: 'delivery-chain',
            },
            {
                details: ['调用模型：生成方案 (plan)'],
                partId: 'workflow-progress-1',
                startedAt: 1_719_739_201_000,
                status: 'running',
                stepId: 'plan',
                summary: '开始方案规划',
                title: '方案规划',
                type: 'workflow-progress-step',
                workflowId: 'delivery-chain-run-1',
            },
            {
                durationMs: 1_200,
                endedAt: 1_719_739_202_200,
                partId: 'workflow-progress-1',
                status: 'completed',
                stepId: 'plan',
                summary: '已完成方案规划',
                title: '方案规划',
                type: 'workflow-progress-step',
                workflowId: 'delivery-chain-run-1',
            },
            {
                durationMs: 6_000,
                endedAt: 1_719_739_206_000,
                partId: 'workflow-progress-1',
                status: 'completed',
                summary: '已处理 6s',
                type: 'workflow-progress-end',
                workflowId: 'delivery-chain-run-1',
            },
        ] satisfies ChatStreamChunk[]

        expect(chunks.map(chunk => chunk.type)).toEqual([
            'workflow-progress-start',
            'workflow-progress-step',
            'workflow-progress-step',
            'workflow-progress-end',
        ])
    })
})
