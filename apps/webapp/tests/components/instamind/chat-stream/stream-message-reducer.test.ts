import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { describe, expect, it } from 'vitest'

import {
    createStreamMessageState,
    reduceStreamChunk,
    reduceStreamTextDeltas,
    type StreamMessageState,
} from '@/components/instamind/chat-stream/stream-message-reducer'

function reduceChunks(chunks: ChatStreamChunk[]) {
    return chunks.reduce((state, chunk) => reduceStreamChunk(state, chunk).state, createStreamMessageState())
}

function getAssistantMessage(state: StreamMessageState) {
    return state.messages.find(message => message.role === 'assistant')
}

describe('stream-message-reducer', () => {
    it('hydrated text messages can coexist with later workflow progress parts without public shape changes', () => {
        const hydratedMessages = [
            {
                id: 'hydrated-user',
                role: 'user' as const,
                parts: [{ type: 'text' as const, text: '刷新前问题', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:00.000Z',
                status: 'completed' as const,
            },
            {
                id: 'hydrated-assistant',
                role: 'assistant' as const,
                parts: [{ type: 'text' as const, text: '刷新前回答', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:01.000Z',
                status: 'completed' as const,
            },
        ]
        const state = [
            { type: 'start' as const, messageId: 'assistant-workflow-after-hydrate' },
            {
                type: 'workflow-progress-start' as const,
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                workflowKind: 'delivery-chain',
                title: '正在生成交付计划...',
            },
            { type: 'finish' as const },
        ].reduce((current, chunk) => reduceStreamChunk(current, chunk).state, createStreamMessageState(hydratedMessages))

        expect(state.messages[0]).toMatchObject({
            id: 'hydrated-user',
            parts: [{ type: 'text' }],
        })
        expect(state.messages[2]?.parts[0]).toMatchObject({
            type: 'workflow-progress',
            workflowKind: 'delivery-chain',
        })
    })

    it('hydrated tool / Tasklist / Delivery final turns 仍保持普通 text message shape', () => {
        const state = createStreamMessageState([
            {
                id: 'hydrated-tool-user',
                role: 'user' as const,
                parts: [{ type: 'text' as const, text: '帮我执行工具', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:00.000Z',
                status: 'completed' as const,
            },
            {
                id: 'hydrated-tool-assistant',
                role: 'assistant' as const,
                parts: [{ type: 'text' as const, text: 'tool final answer', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:01.000Z',
                status: 'completed' as const,
            },
            {
                id: 'hydrated-tasklist-assistant',
                role: 'assistant' as const,
                parts: [{ type: 'text' as const, text: '已生成任务清单摘要。', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:02.000Z',
                status: 'completed' as const,
            },
            {
                id: 'hydrated-delivery-assistant',
                role: 'assistant' as const,
                parts: [{ type: 'text' as const, text: '# Delivery Chain Report', format: 'markdown' as const }],
                createdAt: '2026-07-02T10:00:03.000Z',
                status: 'completed' as const,
            },
        ])

        expect(state.messages).toHaveLength(4)
        expect(state.messages.every(message => message.parts.every(part => part.type === 'text'))).toBe(true)
    })

    it('按 chunk 顺序聚合 text 和 tool part', () => {
        let state = reduceChunks([
            { type: 'start', messageId: 'assistant-1' },
            { type: 'text-start', partId: 'text-1' },
        ])

        state = reduceStreamTextDeltas(state, [
            {
                delta: '先输出正文。',
                messageId: 'assistant-1',
                partId: 'text-1',
                partType: 'text',
            },
        ]).state

        state = reduceStreamChunk(state, {
            type: 'tool-start',
            input: 'value=1, from=kg, to=m',
            partId: 'tool-1',
            toolName: 'unit-convert',
        }).state

        const assistantMessage = getAssistantMessage(state)

        expect(assistantMessage?.parts.map(part => part.type)).toEqual(['text', 'tool'])
        expect(assistantMessage?.parts[0]).toMatchObject({
            text: '先输出正文。',
            type: 'text',
        })
        expect(assistantMessage?.parts[1]).toMatchObject({
            status: 'called',
            toolName: 'unit-convert',
            type: 'tool',
        })
    })

    it('error(scope=tool) 只更新对应 tool part 为 failed', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-1' },
            {
                type: 'tool-start',
                input: 'value=1, from=kg, to=m',
                partId: 'tool-1',
                toolName: 'unit-convert',
            },
            {
                type: 'error',
                errorCode: 'TOOL_EXECUTION_FAILED',
                input: 'value=1, from=kg, to=m',
                message: '单位类型不兼容。',
                partId: 'tool-1',
                retryable: false,
                scope: 'tool',
                toolName: 'unit-convert',
            },
        ])

        const toolPart = getAssistantMessage(state)?.parts.find(part => part.type === 'tool')

        expect(toolPart).toMatchObject({
            error: '单位类型不兼容。',
            status: 'failed',
            type: 'tool',
        })
    })

    it('runtime/request error 返回 fatalError 且保留 active stream', () => {
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-runtime-error' }])
        const result = reduceStreamChunk(state, {
            type: 'error',
            errorCode: 'MODEL_STREAM_FAILED',
            message: 'Model streaming failed.',
            retryable: true,
            scope: 'runtime',
            stage: 'runtime',
        })

        expect(result.fatalError).toBe('Model streaming failed.')
        expect(result.state.activeStream.messageId).toBe('assistant-runtime-error')
    })

    it('workflow progress chunks 会按 stepId 聚合并在结束后默认折叠', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-workflow-progress' },
            {
                type: 'workflow-progress-start',
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                workflowKind: 'delivery-chain',
                title: '正在生成交付计划...',
            },
            {
                type: 'workflow-progress-step',
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                stepId: 'load',
                title: '读取上下文',
                status: 'running',
                summary: '开始读取上下文',
                details: ['读取规则：plan-rubric.md、task-rubric.md、review-rubric.md'],
            },
            {
                type: 'workflow-progress-step',
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                stepId: 'load',
                title: '读取上下文',
                status: 'completed',
                summary: '已读取 demo 上下文 6 项',
                durationMs: 1200,
            },
            {
                type: 'workflow-progress-step',
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                stepId: 'plan',
                title: '方案规划',
                status: 'running',
                summary: '开始方案规划',
                details: ['调用模型：生成方案 (plan)'],
            },
            {
                type: 'workflow-progress-end',
                partId: 'workflow-progress-part',
                workflowId: 'delivery-chain-run-1',
                status: 'completed',
                durationMs: 6250,
            },
        ])

        const workflowPart = getAssistantMessage(state)?.parts.find(part => part.type === 'workflow-progress')

        expect(workflowPart).toMatchObject({
            type: 'workflow-progress',
            workflowId: 'delivery-chain-run-1',
            workflowKind: 'delivery-chain',
            status: 'completed',
            visibility: 'collapsed',
            durationMs: 6250,
            steps: [
                {
                    id: 'load',
                    status: 'completed',
                    summary: '已读取 demo 上下文 6 项',
                    details: ['读取规则：plan-rubric.md、task-rubric.md、review-rubric.md'],
                },
                {
                    id: 'plan',
                    status: 'running',
                    details: ['调用模型：生成方案 (plan)'],
                },
            ],
        })
    })

    it('finish 会清理空 assistant 占位并重置 active stream', () => {
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-empty' }, { type: 'finish' }])

        expect(state.messages).toHaveLength(0)
        expect(state.activeStream).toMatchObject({
            messageId: null,
            reasoningPartId: null,
            textPartId: null,
        })
    })

    it('agent-interrupt 会写入当前 assistant message 并让 finish 保持 paused', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-hitl' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-hitl',
                interruptId: 'interrupt-strategy',
                interruptKind: 'strategy_review',
                payload: {
                    allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                    data: {
                        planUri: 'demo://version-plans/v0.3.0.md',
                        reviewRound: 1,
                        strategy: {
                            granularity: 'medium',
                            grouping: 'by_phase',
                            priorityFocus: ['core_runtime'],
                            stepCountRange: '5-8',
                        },
                    },
                    kind: 'strategy_review',
                    nodeName: 'reviewTasklistStrategy',
                    runId: 'run-hitl',
                    threadId: 'tasklist-agent:c1:run-hitl',
                },
                runId: 'run-hitl',
                threadId: 'tasklist-agent:c1:run-hitl',
                type: 'agent-interrupt',
            },
            { type: 'finish' },
        ])

        const assistantMessage = getAssistantMessage(state)
        const interruptPart = assistantMessage?.parts.find(part => part.type === 'agent-interrupt')

        expect(assistantMessage?.status).toBe('paused')
        expect(interruptPart).toMatchObject({
            interruptId: 'interrupt-strategy',
            interruptKind: 'strategy_review',
            status: 'pending',
            type: 'agent-interrupt',
        })
        expect(state.activeStream.messageId).toBeNull()
    })

    it('duplicate agent-interrupt chunk 不重复创建审核卡', () => {
        const interruptChunk: ChatStreamChunk = {
            agentName: 'version-plan-to-tasklist-agent',
            assistantMessageId: 'assistant-hitl',
            interruptId: 'interrupt-strategy',
            interruptKind: 'strategy_review',
            payload: {
                allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                data: {
                    planUri: 'demo://version-plans/v0.3.0.md',
                    reviewRound: 1,
                    strategy: {
                        granularity: 'medium',
                        grouping: 'by_phase',
                        priorityFocus: ['core_runtime'],
                        stepCountRange: '5-8',
                    },
                },
                kind: 'strategy_review',
                nodeName: 'reviewTasklistStrategy',
                runId: 'run-hitl',
                threadId: 'tasklist-agent:c1:run-hitl',
            },
            runId: 'run-hitl',
            threadId: 'tasklist-agent:c1:run-hitl',
            type: 'agent-interrupt',
        }
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-hitl' }, interruptChunk, interruptChunk])
        const assistantMessage = getAssistantMessage(state)

        expect(assistantMessage?.parts.filter(part => part.type === 'agent-interrupt')).toHaveLength(1)
        expect(assistantMessage?.status).toBe('paused')
    })

    it('agent-resume 会把 active stream 指回原 assistant message，后续 artifact 继续追加到同一消息', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-resume' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-resume',
                interruptId: 'interrupt-strategy',
                interruptKind: 'strategy_review',
                payload: {
                    allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                    data: {
                        planUri: 'demo://version-plans/v0.3.0.md',
                        reviewRound: 1,
                        strategy: {
                            granularity: 'medium',
                            grouping: 'by_phase',
                            priorityFocus: ['core_runtime'],
                            stepCountRange: '5-8',
                        },
                    },
                    kind: 'strategy_review',
                    nodeName: 'reviewTasklistStrategy',
                    runId: 'run-resume',
                    threadId: 'tasklist-agent:c1:run-resume',
                },
                runId: 'run-resume',
                threadId: 'tasklist-agent:c1:run-resume',
                type: 'agent-interrupt',
            },
            { type: 'finish' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-resume',
                interruptId: 'interrupt-strategy',
                runId: 'run-resume',
                threadId: 'tasklist-agent:c1:run-resume',
                type: 'agent-resume',
            },
            {
                type: 'artifact-start',
                artifactId: 'artifact-resumed',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                title: 'Tasklist',
            },
            {
                type: 'artifact-delta',
                artifactId: 'artifact-resumed',
                delta: '# Resumed Tasklist\n',
            },
            { type: 'finish' },
        ])

        const assistantMessage = getAssistantMessage(state)
        const interruptPart = assistantMessage?.parts.find(part => part.type === 'agent-interrupt')

        expect(assistantMessage?.id).toBe('assistant-resume')
        expect(assistantMessage?.status).toBe('completed')
        expect(interruptPart).toMatchObject({
            interruptId: 'interrupt-strategy',
            status: 'decided',
        })
        expect(assistantMessage?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-resumed',
            content: '# Resumed Tasklist\n',
        })
    })

    it('artifact chunks 聚合到 message.artifacts', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-artifact' },
            {
                type: 'artifact-start',
                artifactId: 'artifact-1',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                title: 'Tasklist',
            },
            {
                type: 'artifact-delta',
                artifactId: 'artifact-1',
                delta: '# Step 1\n',
            },
            {
                type: 'artifact-end',
                artifactId: 'artifact-1',
                metadata: {
                    charCount: 9,
                },
                status: 'completed',
            },
        ])

        expect(getAssistantMessage(state)?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-1',
            content: '# Step 1\n',
            metadata: {
                charCount: 9,
            },
            status: 'completed',
            title: 'Tasklist',
        })
    })

    it('graph node start/end 按 runId 聚合到 agent-step part', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-graph-node' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'readVersionPlan',
                partId: 'graph-node-read',
                runId: 'run-graph',
                stepIndex: 1,
                threadId: 'tasklist-agent:c1:run-graph',
                title: '读取版本方案',
                type: 'agent-graph-node-start',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 12,
                nodeId: 'readVersionPlan',
                partId: 'graph-node-read',
                runId: 'run-graph',
                severity: 'info',
                status: 'completed',
                summary: '已读取 version plan。',
                threadId: 'tasklist-agent:c1:run-graph',
                type: 'agent-graph-node-end',
            },
        ])

        const agentPart = getAssistantMessage(state)?.parts.find(part => part.type === 'agent-step')

        expect(agentPart).toMatchObject({
            agentName: 'version-plan-to-tasklist-agent',
            graph: {
                nodes: [
                    {
                        durationMs: 12,
                        nodeId: 'readVersionPlan',
                        patchSummaries: [],
                        status: 'completed',
                        summary: '已读取 version plan。',
                        title: '读取版本方案',
                    },
                ],
                runtime: 'LangGraph',
            },
            runId: 'run-graph',
            status: 'completed',
            type: 'agent-step',
        })
    })

    it('graph node end 保留 warning severity，供 trace 面板渲染警告样式', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-graph-warning' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'validateTasklistV1',
                partId: 'graph-node-warning',
                runId: 'run-graph-warning',
                stepIndex: 1,
                threadId: 'tasklist-agent:c1:run-graph-warning',
                title: '校验 v1 草稿',
                type: 'agent-graph-node-start',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                durationMs: 18,
                nodeId: 'validateTasklistV1',
                partId: 'graph-node-warning',
                runId: 'run-graph-warning',
                severity: 'warning',
                status: 'completed',
                summary: 'v1 结构校验：warning，评分 90。',
                threadId: 'tasklist-agent:c1:run-graph-warning',
                type: 'agent-graph-node-end',
            },
        ])

        const agentPart = getAssistantMessage(state)?.parts.find(part => part.type === 'agent-step')

        expect(agentPart).toMatchObject({
            graph: {
                nodes: [
                    {
                        nodeId: 'validateTasklistV1',
                        severity: 'warning',
                        status: 'completed',
                    },
                ],
            },
        })
    })

    it('graph route 追加到同一次 Agent run', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-graph-route' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'planningDecision',
                partId: 'graph-node-decision',
                runId: 'run-graph',
                stepIndex: 1,
                threadId: 'tasklist-agent:c1:run-graph',
                title: '规划决策',
                type: 'agent-graph-node-start',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                fromNodeId: 'planningDecision',
                partId: 'graph-route',
                reason: '输入已满足任务清单生成条件。',
                routeLabel: 'proceed_to_tasklist_strategy',
                runId: 'run-graph',
                threadId: 'tasklist-agent:c1:run-graph',
                toNodeId: 'decideTasklistStrategy',
                type: 'agent-graph-route',
            },
        ])

        const agentPart = getAssistantMessage(state)?.parts.find(part => part.type === 'agent-step')

        expect(agentPart).toMatchObject({
            graph: {
                routes: [
                    {
                        fromNodeId: 'planningDecision',
                        reason: '输入已满足任务清单生成条件。',
                        routeLabel: 'proceed_to_tasklist_strategy',
                        toNodeId: 'decideTasklistStrategy',
                    },
                ],
            },
        })
    })

    it('graph state patch summary 挂到对应 node，且不会生成普通 text part', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-graph-patch' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'decideWarningDisposition',
                partId: 'graph-node-warning',
                runId: 'run-graph',
                stepIndex: 1,
                threadId: 'tasklist-agent:c1:run-graph',
                title: '决定 warning 处理',
                type: 'agent-graph-node-start',
            },
            {
                agentName: 'version-plan-to-tasklist-agent',
                nodeId: 'decideWarningDisposition',
                partId: 'graph-patch',
                patchSummary: 'warning 处理：fixNow 1，manualReview 2。',
                runId: 'run-graph',
                threadId: 'tasklist-agent:c1:run-graph',
                type: 'agent-graph-state-patch',
            },
        ])

        const assistantMessage = getAssistantMessage(state)
        const agentPart = assistantMessage?.parts.find(part => part.type === 'agent-step')

        expect(assistantMessage?.parts.some(part => part.type === 'text')).toBe(false)
        expect(agentPart).toMatchObject({
            graph: {
                nodes: [
                    {
                        nodeId: 'decideWarningDisposition',
                        patchSummaries: ['warning 处理：fixNow 1，manualReview 2。'],
                    },
                ],
            },
        })
    })

    it('graph debug summary 合并到同一次 Agent run，且不会生成普通 text part', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-graph-debug' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                partId: 'graph-debug-summary',
                runId: 'run-graph',
                summary: {
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
                    optionalContextReads: 0,
                    readiness: {
                        status: 'ready',
                    },
                    runId: 'run-graph',
                    runtimeMode: 'graph',
                    stepCount: 8,
                    threadId: 'tasklist-agent:c1:run-graph',
                    validationV1: {
                        score: 96,
                        status: 'pass',
                    },
                    visitedNodes: ['readVersionPlan', 'emitFinalArtifact'],
                },
                threadId: 'tasklist-agent:c1:run-graph',
                type: 'agent-graph-debug-summary',
            },
        ])

        const assistantMessage = getAssistantMessage(state)
        const agentPart = assistantMessage?.parts.find(part => part.type === 'agent-step')

        expect(assistantMessage?.parts.some(part => part.type === 'text')).toBe(false)
        expect(agentPart).toMatchObject({
            graph: {
                debugSummary: {
                    checkpointMode: 'memory',
                    currentNode: 'emitFinalArtifact',
                    runId: 'run-graph',
                    threadId: 'tasklist-agent:c1:run-graph',
                    visitedNodes: ['readVersionPlan', 'emitFinalArtifact'],
                },
                nodes: [],
                routes: [],
                runtime: 'LangGraph',
            },
        })
    })
})
