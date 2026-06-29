import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const graphMocks = vi.hoisted(() => ({
    createVersionPlanTasklistGraph: vi.fn(),
    getVersionPlanTasklistCheckpointer: vi.fn(() => ({ kind: 'memory-checkpointer' })),
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent/checkpoint/checkpointer-provider', () => ({
    getVersionPlanTasklistCheckpointer: graphMocks.getVersionPlanTasklistCheckpointer,
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent/graph/create-version-plan-tasklist-graph', () => ({
    createVersionPlanTasklistGraph: graphMocks.createVersionPlanTasklistGraph,
}))

import { getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent/config/agent-runtime-config'
import {
    createInitialVersionPlanTasklistGraphState,
    type VersionPlanTasklistGraphStateAnnotationState,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/graph-state'
import { resumeVersionPlanTasklistGraph } from '@/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph'

function createCompletedGraphState(): VersionPlanTasklistGraphStateAnnotationState {
    const initialState = createInitialVersionPlanTasklistGraphState({
        conversationId: 'conversation-resume-state-fallback-test',
        runId: 'run-resume-state-fallback-test',
        runtimeConfig: getTasklistAgentRuntimeConfig(
            {
                AI_MIND_GRAPH_CHECKPOINT: 'memory',
                AI_MIND_GRAPH_DEBUG_VIEW: 'on',
            },
            'development'
        ),
        userGoal: '基于版本方案继续生成 tasklist',
        versionPlanReference: {
            id: 'demo://version-plans/v030-hitl-checkpoint-resume.md',
            label: 'v030-hitl-checkpoint-resume.md',
            source: 'local',
            type: 'resource',
            uri: 'demo://version-plans/v030-hitl-checkpoint-resume.md',
        },
    })

    return {
        ...initialState,
        execution: {
            ...initialState.execution,
            status: 'final',
        },
        graph: {
            ...initialState.graph,
            currentNode: 'emitFinalArtifact',
        },
        planning: {
            ...initialState.planning,
            revisionEffect: {
                finalDecision: 'final',
            },
        } as VersionPlanTasklistGraphStateAnnotationState['planning'],
        output: initialState.output,
    }
}

describe('runtime/version-plan-tasklist-agent graph runner resume state fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('resume invoke 返回 partial state 时，优先使用 snapshot.values 继续分类并输出 debug summary', async () => {
        const fullGraphState = createCompletedGraphState()
        const partialGraphState = {
            ...fullGraphState,
            execution: undefined,
        } as unknown as VersionPlanTasklistGraphStateAnnotationState
        const writtenChunks: ChatStreamChunk[] = []

        graphMocks.createVersionPlanTasklistGraph.mockReturnValue({
            getState: vi.fn().mockResolvedValue({
                config: {
                    configurable: {
                        thread_id: fullGraphState.threadId,
                    },
                },
                next: [],
                tasks: [],
                values: fullGraphState,
            }),
            invoke: vi.fn().mockResolvedValue(partialGraphState),
        })

        const result = await resumeVersionPlanTasklistGraph({
            context: {},
            decision: { type: 'approve' },
            models: {
                drafting: { model: {} as never, timeoutMs: 300_000 },
                planning: { model: {} as never, timeoutMs: 90_000 },
            },
            runId: fullGraphState.execution.runId,
            runtimeConfig: getTasklistAgentRuntimeConfig(
                {
                    AI_MIND_GRAPH_CHECKPOINT: 'memory',
                    AI_MIND_GRAPH_DEBUG_VIEW: 'on',
                },
                'development'
            ),
            threadId: fullGraphState.threadId,
            userGoal: '基于版本方案继续生成 tasklist',
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        expect(result.status).toBe('completed')

        if (result.status !== 'completed') {
            throw new Error('Expected completed graph result.')
        }

        expect(result.resultStatus).toBe('final')
        expect(result.graphState.execution.runId).toBe(fullGraphState.execution.runId)
        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                agentName: 'version-plan-to-tasklist-agent',
                runId: fullGraphState.execution.runId,
                threadId: fullGraphState.threadId,
                type: 'agent-graph-debug-summary',
            })
        )
    })
})
