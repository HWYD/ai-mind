import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const chatServiceMocks = vi.hoisted(() => ({
    rejectAgentRun: vi.fn(),
    resumeAgentRun: vi.fn(),
}))
const streamRecoveryMocks = vi.hoisted(() => ({
    projectLifecycle: vi.fn(),
}))
const agentRunMocks = vi.hoisted(() => {
    class MockAgentRunServiceError extends Error {
        readonly code: string

        constructor(code: string, message: string) {
            super(message)
            this.name = 'AgentRunServiceError'
            this.code = code
        }
    }

    return {
        AgentRunServiceError: MockAgentRunServiceError,
        beginResume: vi.fn(),
        getOwnedRunExecutionMetadata: vi.fn(),
        markRejected: vi.fn(),
    }
})

vi.mock('@/lib/ai/chat-service', () => ({
    createChatService: () => ({
        rejectAgentRun: chatServiceMocks.rejectAgentRun,
        resumeAgentRun: chatServiceMocks.resumeAgentRun,
    }),
}))

vi.mock('@/lib/ai/stream-recovery/stream-event-projector', () => ({
    StreamEventProjector: class StreamEventProjectorMock {
        projectLifecycle = streamRecoveryMocks.projectLifecycle
    },
}))

vi.mock('@/lib/ai/agent-runs', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/agent-runs')>()

    return {
        ...actual,
        AgentRunService: class AgentRunServiceMock {
            beginResume = agentRunMocks.beginResume
            getOwnedRunExecutionMetadata = agentRunMocks.getOwnedRunExecutionMetadata
            markRejected = agentRunMocks.markRejected
        },
        AgentRunServiceError: agentRunMocks.AgentRunServiceError,
    }
})

vi.mock('@/lib/ai/rate-limit', () => ({
    resolveSessionId: () => ({
        sessionId: 'session-agent-resume',
        setCookie: 'sid=session-agent-resume',
    }),
}))

vi.mock('@/lib/ai/model-provider/catalog/resolve-model-selection', () => ({
    ModelSelectionError: class ModelSelectionErrorMock extends Error {},
    resolveModelSelection: () => ({
        modelId: 'ollama/qwen3-8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
        routeType: 'tasklist',
    }),
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent', () => ({
    createTasklistAgentModelSet: () => ({
        drafting: {},
        planning: {},
    }),
    getTasklistAgentRuntimeConfig: () => ({
        graphCheckpointMode: 'memory',
        graphDebugViewEnabled: false,
        graphEventsEnabled: false,
    }),
}))

import { POST } from '@/app/api/agent-runs/[runId]/resume/route'

function createResumeRequest(decision: unknown = { type: 'approve' }) {
    return new NextRequest('http://localhost:3000/api/agent-runs/run_tasklist/resume', {
        body: JSON.stringify({
            decision,
            interruptId: 'interrupt_1',
        }),
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
    })
}

function createPreparedResume(decision: unknown = { type: 'approve' }) {
    return {
        conversationId: 'conv_1',
        decision,
        interrupt: {
            allowedDecisions: ['approve', 'reject'],
            interruptId: 'interrupt_1',
            interruptKind: 'strategy_review' as const,
            nodeName: 'reviewTasklistStrategy',
            payload: {
                kind: 'strategy_review' as const,
                nodeName: 'reviewTasklistStrategy',
                runId: 'run_tasklist',
                threadId: 'tasklist-agent:c1:run_tasklist',
            },
            runId: 'run_tasklist',
            status: 'decided' as const,
            threadId: 'tasklist-agent:c1:run_tasklist',
        },
        run: {
            agentType: 'version-plan-to-tasklist-agent',
            agentVersion: 'v0.3.0',
            assistantMessageId: 'assistant_1',
            graphVersion: 'v0.3.0',
            runId: 'run_tasklist',
            status: 'resuming' as const,
        },
        threadId: 'tasklist-agent:c1:run_tasklist',
    }
}

describe('POST /api/agent-runs/[runId]/resume stream recovery', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        agentRunMocks.getOwnedRunExecutionMetadata.mockResolvedValue({
            modelId: 'ollama/qwen3-8b',
            reasoningEnabled: false,
            userGoalSummary: '生成 tasklist',
        })
        agentRunMocks.beginResume.mockResolvedValue(createPreparedResume())
        agentRunMocks.markRejected.mockResolvedValue(undefined)
        chatServiceMocks.resumeAgentRun.mockResolvedValue(new Response('ok'))
        chatServiceMocks.rejectAgentRun.mockResolvedValue(new Response('rejected'))
        streamRecoveryMocks.projectLifecycle.mockResolvedValue({})
    })

    it('continues HITL resume through the same StreamRun identity', async () => {
        const response = await POST(createResumeRequest(), {
            params: { runId: 'run_tasklist' },
        })

        expect(response.headers.get('X-Run-Id')).toBe('run_tasklist')
        expect(response.headers.get('X-Stream-Protocol')).toBe('ai-mind-resumable-v1')
        expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
        expect(chatServiceMocks.resumeAgentRun).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                signal: undefined,
                streamRecovery: expect.objectContaining({
                    ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                    requestSignal: expect.any(AbortSignal),
                    runId: 'run_tasklist',
                }),
            })
        )
    })

    it('projects reject output through the same StreamRun identity', async () => {
        const decision = { reason: '不继续', type: 'reject' }
        agentRunMocks.beginResume.mockResolvedValueOnce(createPreparedResume(decision))

        const response = await POST(createResumeRequest(decision), {
            params: Promise.resolve({ runId: 'run_tasklist' }),
        })

        expect(response.headers.get('X-Run-Id')).toBe('run_tasklist')
        expect(agentRunMocks.markRejected).toHaveBeenCalledWith('run_tasklist')
        expect(chatServiceMocks.rejectAgentRun).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run_tasklist',
            }),
            expect.objectContaining({
                signal: undefined,
                streamRecovery: expect.objectContaining({
                    runId: 'run_tasklist',
                }),
            })
        )
    })

    it('projects version mismatch as a terminal StreamRun state', async () => {
        agentRunMocks.beginResume.mockRejectedValueOnce(
            new agentRunMocks.AgentRunServiceError('AGENT_RUN_VERSION_MISMATCH', 'resume version mismatch')
        )

        const response = await POST(createResumeRequest(), {
            params: { runId: 'run_tasklist' },
        })

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toMatchObject({
            code: 'AGENT_RUN_VERSION_MISMATCH',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'AGENT_RUN_VERSION_MISMATCH',
                retryable: false,
                runId: 'run_tasklist',
            }),
        })
        expect(streamRecoveryMocks.projectLifecycle).toHaveBeenCalledWith({
            agentRunId: 'run_tasklist',
            code: 'AGENT_RUN_VERSION_MISMATCH',
            message: 'resume version mismatch',
            ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            runId: 'run_tasklist',
            status: 'version_mismatch',
        })
    })
})
