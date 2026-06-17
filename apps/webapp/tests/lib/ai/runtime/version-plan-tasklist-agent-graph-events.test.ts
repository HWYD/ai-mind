import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '@/lib/ai/runtime/types'
import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    emitGraphNodeEnd,
    emitGraphNodeStart,
    emitGraphRoute,
    emitGraphStatePatch,
    type GraphNodeHandler,
    withGraphNodeEvents,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-events'
import { VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-node-ids'
import { createInitialVersionPlanTasklistGraphState } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import type { ChatComposerReference } from '@/lib/ai/types/chat'

const versionPlanReference: ChatComposerReference = {
    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
    label: 'v0.2.0-controlled-agent-graph.md',
    source: 'local',
    type: 'resource',
    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
}

function createGraphState() {
    return createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-graph-events-test',
        runId: 'run-graph-events-test',
        runtimeConfig: getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_EVENTS: 'on',
            },
            'development'
        ),
        userGoal: '生成 tasklist',
        versionPlanReference,
    })
}

describe('runtime/version-plan-tasklist-agent graph events', () => {
    it('emits node, route and state patch chunks without full graph state', () => {
        const chunks: ChatStreamChunk[] = []
        const writeChunk = (chunk: ChatStreamChunk) => chunks.push(chunk)

        emitGraphNodeStart(writeChunk, {
            agentName: 'version-plan-to-tasklist-agent',
            nodeId: 'readVersionPlan',
            partId: 'graph-node',
            runId: 'run-1',
            stepIndex: 1,
            threadId: 'tasklist-agent:conversation-1:run-1',
            title: '读取版本方案',
        })
        emitGraphRoute(writeChunk, {
            agentName: 'version-plan-to-tasklist-agent',
            route: {
                fromNodeId: 'readVersionPlan',
                label: 'read_succeeded',
                reason: '读取成功。',
                toNodeId: 'evaluatePlanReadiness',
            },
            runId: 'run-1',
            threadId: 'tasklist-agent:conversation-1:run-1',
        })
        emitGraphStatePatch(writeChunk, {
            agentName: 'version-plan-to-tasklist-agent',
            nodeId: 'readVersionPlan',
            patchSummary: '已读取 version plan。',
            runId: 'run-1',
            threadId: 'tasklist-agent:conversation-1:run-1',
        })
        emitGraphNodeEnd(writeChunk, {
            agentName: 'version-plan-to-tasklist-agent',
            durationMs: 3,
            nodeId: 'readVersionPlan',
            partId: 'graph-node',
            runId: 'run-1',
            severity: 'info',
            status: 'completed',
            summary: '已读取 version plan。',
            threadId: 'tasklist-agent:conversation-1:run-1',
        })

        expect(chunks.map(chunk => chunk.type)).toEqual([
            'agent-graph-node-start',
            'agent-graph-route',
            'agent-graph-state-patch',
            'agent-graph-node-end',
        ])
        expect(chunks.find(chunk => chunk.type === 'agent-graph-state-patch')).toMatchObject({
            patchSummary: '已读取 version plan。',
        })
        expect(JSON.stringify(chunks)).not.toContain('tasklistDraft')
    })

    it('emits a failed node end with sanitized error when node throws', async () => {
        const chunks: ChatStreamChunk[] = []
        const runtime = {
            context: {},
            model: { invoke: vi.fn() } as unknown as ChatSession['baseModel'],
            runtimeConfig: getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_EVENTS: 'on',
                },
                'development'
            ),
            userGoal: '生成 tasklist',
            writeChunk: (chunk: ChatStreamChunk) => chunks.push(chunk),
        }
        const node = withGraphNodeEvents(
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.readVersionPlan,
            () => {
                throw new Error('first line\nsecond line with stack-like detail')
            },
            runtime
        )

        await expect(node({ ...createGraphState(), output: undefined })).rejects.toThrow('first line')

        expect(chunks.map(chunk => chunk.type)).toEqual(['agent-graph-node-start', 'agent-graph-node-end'])
        expect(chunks[1]).toMatchObject({
            error: 'first line second line with stack-like detail',
            severity: 'error',
            status: 'failed',
            type: 'agent-graph-node-end',
        })
    })

    it('emits warning completed node end when node returns a controlled stopped output', async () => {
        const chunks: ChatStreamChunk[] = []
        const runtime = {
            context: {},
            model: { invoke: vi.fn() } as unknown as ChatSession['baseModel'],
            runtimeConfig: getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_EVENTS: 'on',
                },
                'development'
            ),
            userGoal: '生成 tasklist',
            writeChunk: (chunk: ChatStreamChunk) => chunks.push(chunk),
        }
        const node: GraphNodeHandler = () => ({
            graph: {
                currentNode: 'planningDecision',
                statePatchSummaries: [
                    {
                        nodeId: 'planningDecision',
                        summary: '规划决策输出不符合受控 JSON schema，本轮已安全停止。',
                    },
                ],
                visitedNodes: ['planningDecision'],
            },
            output: {
                status: 'stopped',
                textSummary: '规划决策输出不符合受控 JSON schema，本轮已安全停止。',
            },
        })

        await withGraphNodeEvents(
            VERSION_PLAN_TASKLIST_GRAPH_NODE_IDS.planningDecision,
            node,
            runtime
        )({
            ...createGraphState(),
            output: undefined,
        })

        expect(chunks.map(chunk => chunk.type)).toEqual(['agent-graph-node-start', 'agent-graph-state-patch', 'agent-graph-node-end'])
        expect(chunks[2]).toMatchObject({
            severity: 'warning',
            status: 'completed',
            tags: ['status: stopped'],
            type: 'agent-graph-node-end',
        })
    })
})
