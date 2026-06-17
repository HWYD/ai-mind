import { describe, expect, it } from 'vitest'

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    VERSION_PLAN_TASKLIST_AGENT_LIMITS,
    VERSION_PLAN_TASKLIST_AGENT_NAME,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/contract/types'
import {
    applyVersionPlanTasklistGraphStateUpdate,
    buildVersionPlanTasklistGraphThreadId,
    createInitialVersionPlanTasklistGraphRuntimeState,
    createInitialVersionPlanTasklistGraphState,
    reduceVersionPlanTasklistGraphRuntimeState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'

const versionPlanReference = {
    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
    label: 'v0.2.0 Controlled Agent Graph',
    source: 'local',
    type: 'resource',
    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
} as const

function createGraphState() {
    return createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-1',
        runId: 'run-graph-state-test',
        runtimeConfig: getTasklistAgentRuntimeConfig({}, 'development'),
        userGoal: 'Generate v0.2.0 tasklist',
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
    it('builds a graph-only thread id without changing the conversation model', () => {
        expect(
            buildVersionPlanTasklistGraphThreadId({
                conversationId: 'conversation-1',
                runId: 'run-1',
            })
        ).toBe('tasklist-agent:conversation-1:run-1')
    })

    it('creates initial GraphState as the runtime fact source', () => {
        const runtimeConfig = getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
            },
            'development'
        )

        expect(
            createInitialVersionPlanTasklistGraphState({
                conversationId: 'conversation-1',
                runId: 'run-graph-state-test',
                runtimeConfig,
                userGoal: 'Generate v0.2.0 tasklist',
                versionPlanReference,
            })
        ).toEqual({
            execution: {
                agentName: VERSION_PLAN_TASKLIST_AGENT_NAME,
                counters: {
                    draftRevisions: 0,
                    optionalContextReads: 0,
                    steps: 0,
                },
                limits: VERSION_PLAN_TASKLIST_AGENT_LIMITS,
                runId: 'run-graph-state-test',
                status: 'idle',
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
                userGoal: 'Generate v0.2.0 tasklist',
            },
            planning: {
                manualReviewItems: [],
            },
            source: {
                versionPlanReference,
            },
            tasklist: {},
            threadId: 'tasklist-agent:conversation-1:run-graph-state-test',
        })
    })

    it('keeps initial GraphState JSON-serializable and free of runtime objects', () => {
        const graphState = createGraphState()

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

    it('replaces scalar graph fields and appends graph trace arrays', () => {
        const route = {
            fromNodeId: 'planningDecision',
            label: 'read_optional_context',
            reason: 'Need optional context.',
            toNodeId: 'readOptionalContext',
        }
        const initial = {
            ...createInitialVersionPlanTasklistGraphRuntimeState('memory'),
            currentNode: 'readVersionPlan',
            statePatchSummaries: [
                {
                    nodeId: 'readVersionPlan',
                    summary: 'Version plan has been read.',
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
                        summary: 'Planning decision completed.',
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
                    summary: 'Version plan has been read.',
                },
                {
                    nodeId: 'planningDecision',
                    summary: 'Planning decision completed.',
                },
            ],
            visitedNodes: ['readVersionPlan', 'planningDecision'],
        })
    })

    it('merges section patches without dropping sibling fields', () => {
        const graphState = {
            ...createGraphState(),
            output: undefined,
            planning: {
                decision: {
                    reason: '继续。',
                    type: 'proceed_to_tasklist_strategy' as const,
                },
                manualReviewItems: [
                    {
                        detail: '测试范围需要确认。',
                        severity: 'warning' as const,
                        title: '测试范围',
                    },
                ],
            },
            tasklist: {
                draft: {
                    content: '# Tasklist',
                    createdAtStep: 5,
                    planUri: versionPlanReference.uri,
                    version: 1 as const,
                },
            },
        }

        expect(
            applyVersionPlanTasklistGraphStateUpdate(graphState, {
                execution: {
                    counters: {
                        steps: 6,
                    },
                    status: 'validated_v1',
                },
                planning: {
                    strategy: {
                        expectedStepRange: [3, 5],
                        granularity: 'medium',
                        grouping: ['Runtime'],
                        priority: ['先收状态'],
                        reason: '保持中等粒度。',
                    },
                },
                tasklist: {},
            })
        ).toMatchObject({
            execution: {
                counters: {
                    draftRevisions: 0,
                    optionalContextReads: 0,
                    steps: 6,
                },
                status: 'validated_v1',
            },
            planning: {
                decision: {
                    type: 'proceed_to_tasklist_strategy',
                },
                manualReviewItems: [
                    {
                        title: '测试范围',
                    },
                ],
                strategy: {
                    granularity: 'medium',
                },
            },
            tasklist: {
                draft: {
                    content: '# Tasklist',
                },
            },
        })
    })
})
