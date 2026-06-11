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
    it('按 chunk 顺序聚合 text 与 tool part', () => {
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
                message: '单位类型不兼容',
                partId: 'tool-1',
                retryable: false,
                scope: 'tool',
                toolName: 'unit-convert',
            },
        ])

        const toolPart = getAssistantMessage(state)?.parts.find(part => part.type === 'tool')

        expect(toolPart).toMatchObject({
            error: '单位类型不兼容',
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

    it('finish 会清理空 assistant 占位并重置 active stream', () => {
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-empty' }, { type: 'finish' }])

        expect(state.messages).toHaveLength(0)
        expect(state.activeStream).toMatchObject({
            messageId: null,
            reasoningPartId: null,
            textPartId: null,
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
            steps: [],
            type: 'agent-step',
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
                actionType: 'planning_decision',
                agentName: 'version-plan-to-tasklist-agent',
                partId: 'legacy-decision',
                runId: 'run-graph',
                stepIndex: 1,
                title: '执行 Planning Decision',
                type: 'agent-step-start',
            },
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
            steps: [
                {
                    partId: 'legacy-decision',
                    status: 'running',
                },
            ],
        })
    })
})
