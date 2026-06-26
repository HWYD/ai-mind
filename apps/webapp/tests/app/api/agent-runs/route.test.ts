import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
    beginResume: vi.fn(),
    getOwnedRun: vi.fn(),
    getOwnedRunExecutionMetadata: vi.fn(),
    markFailed: vi.fn(),
    markRejected: vi.fn(),
}))
const resumeAgentRunMock = vi.hoisted(() => vi.fn())
const rejectAgentRunMock = vi.hoisted(() => vi.fn())
const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'session-test', setCookie: 'sid=session-test' })))
const resolveModelSelectionMock = vi.hoisted(() => vi.fn())
const createTasklistAgentModelSetMock = vi.hoisted(() => vi.fn())
const getTasklistAgentRuntimeConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/agent-runs', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/agent-runs')>()

    return {
        ...actual,
        AgentRunService: class AgentRunServiceMock {
            beginResume = serviceMocks.beginResume
            getOwnedRun = serviceMocks.getOwnedRun
            getOwnedRunExecutionMetadata = serviceMocks.getOwnedRunExecutionMetadata
            markFailed = serviceMocks.markFailed
            markRejected = serviceMocks.markRejected
        },
    }
})

vi.mock('@/lib/ai/chat-service', () => ({
    createChatService: () => ({
        rejectAgentRun: rejectAgentRunMock,
        resumeAgentRun: resumeAgentRunMock,
    }),
}))

vi.mock('@/lib/ai/rate-limit', () => ({
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/model-provider/catalog/resolve-model-selection', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/model-provider/catalog/resolve-model-selection')>()

    return {
        ...actual,
        resolveModelSelection: resolveModelSelectionMock,
    }
})

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent', () => ({
    createTasklistAgentModelSet: createTasklistAgentModelSetMock,
    getTasklistAgentRuntimeConfig: getTasklistAgentRuntimeConfigMock,
}))

import { POST } from '@/app/api/agent-runs/[runId]/resume/route'
import { GET } from '@/app/api/agent-runs/[runId]/route'
import { AgentRunServiceError } from '@/lib/ai/agent-runs'

function createJsonRequest(body: unknown) {
    return new NextRequest('http://localhost:3000/api/agent-runs/run-test/resume', {
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
        },
        method: 'POST',
    })
}

describe('AgentRun API routes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveModelSelectionMock.mockReturnValue({
            modelId: 'ollama/qwen3-8b',
            provider: 'ollama',
            providerModel: 'qwen3:8b',
            routeType: 'tasklist',
        })
        createTasklistAgentModelSetMock.mockReturnValue({ drafting: {}, planning: {} })
        getTasklistAgentRuntimeConfigMock.mockReturnValue({ graphCheckpointMode: 'memory' })
        rejectAgentRunMock.mockResolvedValue(new Response('reject-ok'))
        resumeAgentRunMock.mockResolvedValue(new Response('stream-ok'))
    })

    it('GET 返回当前 session 可访问的 AgentRun public DTO', async () => {
        serviceMocks.getOwnedRun.mockResolvedValueOnce({
            assistantMessageId: 'assistant-test',
            pendingInterrupt: {
                interruptId: 'interrupt-test',
                interruptKind: 'strategy_review',
                status: 'pending',
            },
            runId: 'run-test',
            status: 'paused',
        })

        const response = await GET(new NextRequest('http://localhost:3000/api/agent-runs/run-test'), {
            params: { runId: 'run-test' },
        })
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('Set-Cookie')).toBe('sid=session-test')
        expect(serviceMocks.getOwnedRun).toHaveBeenCalledWith('session-test', 'run-test')
        expect(body).toMatchObject({
            pendingInterrupt: {
                interruptId: 'interrupt-test',
            },
            status: 'paused',
        })
    })

    it('POST resume 先校验并 beginResume，再返回继续写原 assistant message 的流', async () => {
        serviceMocks.getOwnedRunExecutionMetadata.mockResolvedValueOnce({
            modelId: 'ollama/qwen3-8b',
            reasoningEnabled: false,
            userGoalSummary: '生成 tasklist',
        })
        serviceMocks.beginResume.mockResolvedValueOnce({
            decision: { type: 'approve' },
            interrupt: {
                interruptId: 'interrupt-test',
                interruptKind: 'strategy_review',
                status: 'decided',
            },
            run: {
                assistantMessageId: 'assistant-test',
                runId: 'run-test',
                status: 'resuming',
            },
            threadId: 'thread-test',
        })

        const response = await POST(createJsonRequest({ decision: { type: 'approve' }, interruptId: 'interrupt-test' }), {
            params: Promise.resolve({ runId: 'run-test' }),
        })

        expect(response.status).toBe(200)
        expect(serviceMocks.getOwnedRunExecutionMetadata).toHaveBeenCalledWith('session-test', 'run-test')
        expect(resolveModelSelectionMock).toHaveBeenCalledWith({
            modelId: 'ollama/qwen3-8b',
            routeType: 'tasklist',
        })
        expect(serviceMocks.beginResume).toHaveBeenCalledWith({
            decision: { type: 'approve' },
            interruptId: 'interrupt-test',
            runId: 'run-test',
            sessionId: 'session-test',
        })
        expect(resumeAgentRunMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interruptId: 'interrupt-test',
                preparedResume: expect.objectContaining({
                    threadId: 'thread-test',
                }),
                runId: 'run-test',
                userGoal: '生成 tasklist',
            }),
            expect.objectContaining({
                sessionId: 'session-test',
                setCookie: 'sid=session-test',
            })
        )
    })

    it('POST reject 直接结束本轮，不依赖模型解析或 graph resume', async () => {
        serviceMocks.beginResume.mockResolvedValueOnce({
            decision: { type: 'reject' },
            interrupt: {
                interruptId: 'interrupt-test',
                interruptKind: 'strategy_review',
                status: 'rejected',
            },
            run: {
                assistantMessageId: 'assistant-test',
                runId: 'run-test',
                status: 'resuming',
            },
            threadId: 'thread-test',
        })
        serviceMocks.markRejected.mockResolvedValueOnce({
            resultStatus: 'rejected',
            status: 'rejected',
        })

        const response = await POST(createJsonRequest({ decision: { type: 'reject' }, interruptId: 'interrupt-test' }), {
            params: Promise.resolve({ runId: 'run-test' }),
        })

        expect(response.status).toBe(200)
        expect(serviceMocks.beginResume).toHaveBeenCalledWith({
            decision: { type: 'reject' },
            interruptId: 'interrupt-test',
            runId: 'run-test',
            sessionId: 'session-test',
        })
        expect(serviceMocks.markRejected).toHaveBeenCalledWith('run-test')
        expect(serviceMocks.getOwnedRunExecutionMetadata).not.toHaveBeenCalled()
        expect(resolveModelSelectionMock).not.toHaveBeenCalled()
        expect(createTasklistAgentModelSetMock).not.toHaveBeenCalled()
        expect(resumeAgentRunMock).not.toHaveBeenCalled()
        expect(rejectAgentRunMock).toHaveBeenCalledWith(
            {
                assistantMessageId: 'assistant-test',
                interruptId: 'interrupt-test',
                runId: 'run-test',
                summary: '已终止本轮 tasklist 生成。当前策略不会继续执行。',
                threadId: 'thread-test',
            },
            expect.objectContaining({
                sessionId: 'session-test',
                setCookie: 'sid=session-test',
            })
        )
    })

    it('POST duplicate resume 返回 409，且不会启动 resume stream', async () => {
        serviceMocks.getOwnedRunExecutionMetadata.mockResolvedValueOnce({
            modelId: 'ollama/qwen3-8b',
            reasoningEnabled: false,
            userGoalSummary: '生成 tasklist',
        })
        serviceMocks.beginResume.mockRejectedValueOnce(new AgentRunServiceError('AGENT_INTERRUPT_NOT_PENDING', '当前审核点已经被处理。'))

        const response = await POST(createJsonRequest({ decision: { type: 'approve' }, interruptId: 'interrupt-test' }), {
            params: { runId: 'run-test' },
        })
        const body = await response.json()

        expect(response.status).toBe(409)
        expect(body).toMatchObject({
            code: 'AGENT_INTERRUPT_NOT_PENDING',
        })
        expect(resumeAgentRunMock).not.toHaveBeenCalled()
    })

    it.each([
        ['AGENT_RUN_FORBIDDEN', 403],
        ['AGENT_RUN_NOT_FOUND', 404],
        ['AGENT_RUN_VERSION_MISMATCH', 409],
        ['AGENT_RUN_NOT_PAUSED', 409],
    ] as const)('POST resume 将 %s 映射为 HTTP %i', async (code, status) => {
        serviceMocks.getOwnedRunExecutionMetadata.mockResolvedValueOnce({
            modelId: 'ollama/qwen3-8b',
            reasoningEnabled: false,
            userGoalSummary: '生成 tasklist',
        })
        serviceMocks.beginResume.mockRejectedValueOnce(new AgentRunServiceError(code, 'resume rejected'))

        const response = await POST(createJsonRequest({ decision: { type: 'approve' }, interruptId: 'interrupt-test' }), {
            params: { runId: 'run-test' },
        })
        const body = await response.json()

        expect(response.status).toBe(status)
        expect(body).toMatchObject({ code })
        expect(resumeAgentRunMock).not.toHaveBeenCalled()
    })
})
