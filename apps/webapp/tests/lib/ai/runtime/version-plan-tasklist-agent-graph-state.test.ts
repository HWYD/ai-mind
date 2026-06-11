import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    buildVersionPlanTasklistGraphThreadId,
    createInitialVersionPlanTasklistGraphRuntimeState,
    createInitialVersionPlanTasklistGraphState,
    reduceVersionPlanTasklistGraphRuntimeState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { createInitialVersionPlanTasklistAgentState } from '@/lib/ai/runtime/version-plan-tasklist-agent/state/state-machine'

const versionPlanReference = {
    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
} as const

function createAgentState() {
    return createInitialVersionPlanTasklistAgentState({
        runId: 'run-graph-state-test',
        versionPlanReference,
    })
}

describe('runtime/version-plan-tasklist-agent graph state', () => {
    it('构造 graph 专用 thread id，不改变 conversation model', () => {
        expect(
            buildVersionPlanTasklistGraphThreadId({
                conversationId: 'conversation-1',
                runId: 'run-1',
            })
        ).toBe('tasklist-agent:conversation-1:run-1')
    })

    it('初始化 GraphState 时复用 AgentState 作为业务事实源', () => {
        const agentState = createAgentState()
        const runtimeConfig = getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
                AI_MIND_TASKLIST_AGENT_RUNTIME: 'graph',
            },
            'development'
        )

        expect(
            createInitialVersionPlanTasklistGraphState({
                agentState,
                conversationId: 'conversation-1',
                runtimeConfig,
                userGoal: '生成 v0.2.0 tasklist',
            })
        ).toEqual({
            agentState,
            graph: {
                checkpointMode: 'memory',
                routes: [],
                runtimeMode: 'graph',
                statePatchSummaries: [],
                visitedNodes: [],
            },
            input: {
                planUri: versionPlanReference.uri,
                userGoal: '生成 v0.2.0 tasklist',
            },
            threadId: 'tasklist-agent:conversation-1:run-graph-state-test',
        })
    })

    it('graph runtime reducer 对标量 replace，对轨迹数组 append', () => {
        const route = {
            fromNodeId: 'planningDecision',
            label: 'read_optional_context',
            reason: '需要补充上下文',
            toNodeId: 'readOptionalContext',
        }
        const initial = {
            ...createInitialVersionPlanTasklistGraphRuntimeState('memory'),
            currentNode: 'readVersionPlan',
            statePatchSummaries: [
                {
                    nodeId: 'readVersionPlan',
                    summary: '已读取 version plan。',
                },
            ],
            visitedNodes: ['readVersionPlan'],
        }

        expect(
            reduceVersionPlanTasklistGraphRuntimeState(initial, {
                checkpointMode: 'off',
                currentNode: 'planningDecision',
                lastRoute: route,
                routes: [route],
                statePatchSummaries: [
                    {
                        nodeId: 'planningDecision',
                        summary: '已完成规划决策。',
                    },
                ],
                visitedNodes: ['planningDecision'],
            })
        ).toEqual({
            checkpointMode: 'off',
            currentNode: 'planningDecision',
            lastRoute: route,
            routes: [route],
            runtimeMode: 'graph',
            statePatchSummaries: [
                {
                    nodeId: 'readVersionPlan',
                    summary: '已读取 version plan。',
                },
                {
                    nodeId: 'planningDecision',
                    summary: '已完成规划决策。',
                },
            ],
            visitedNodes: ['readVersionPlan', 'planningDecision'],
        })
    })
})
