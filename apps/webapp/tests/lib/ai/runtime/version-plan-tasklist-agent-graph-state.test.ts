import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    buildVersionPlanTasklistGraphThreadId,
    createInitialVersionPlanTasklistGraphRuntimeState,
    createInitialVersionPlanTasklistGraphState,
    reduceVersionPlanTasklistGraphRuntimeState,
    toVersionPlanTasklistAgentState,
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

function walkJsonObject(value: unknown, visit: (value: unknown) => void) {
    visit(value)

    if (!value || typeof value !== 'object') {
        return
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            walkJsonObject(item, visit)
        }
        return
    }

    for (const child of Object.values(value)) {
        walkJsonObject(child, visit)
    }
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

    it('初始化 GraphState 时按 Graph-first 分区承载运行态', () => {
        const agentState = createAgentState()
        const runtimeConfig = getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
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
            execution: {
                agentName: agentState.agentName,
                counters: agentState.counters,
                limits: agentState.limits,
                runId: agentState.runId,
                status: agentState.status,
            },
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
            planning: agentState.artifacts.planning,
            source: {
                versionPlan: undefined,
                versionPlanReference,
            },
            tasklist: {
                draft: undefined,
            },
            threadId: 'tasklist-agent:conversation-1:run-graph-state-test',
        })
    })

    it('GraphState 可临时还原为领域 AgentState 以复用既有状态机规则', () => {
        const agentState = createAgentState()
        const graphState = createInitialVersionPlanTasklistGraphState({
            agentState,
            conversationId: 'conversation-1',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '生成 v0.2.0 tasklist',
        })

        expect(toVersionPlanTasklistAgentState(graphState)).toEqual(agentState)
    })

    it('初始 GraphState 可 JSON 序列化，且不混入运行时对象', () => {
        const graphState = createInitialVersionPlanTasklistGraphState({
            agentState: createAgentState(),
            conversationId: 'conversation-1',
            runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
            userGoal: '生成 v0.2.0 tasklist',
        })

        expect(() => JSON.stringify(graphState)).not.toThrow()
        expect(JSON.parse(JSON.stringify(graphState))).toEqual(graphState)

        walkJsonObject(graphState, value => {
            expect(typeof value).not.toBe('function')
            expect(value).not.toBeInstanceOf(Error)
            expect(value).not.toBeInstanceOf(AbortController)

            if (typeof AbortSignal !== 'undefined') {
                expect(value).not.toBeInstanceOf(AbortSignal)
            }
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
