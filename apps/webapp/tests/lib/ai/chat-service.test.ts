import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentRunPublicDto } from '@/lib/ai/agent-runs/contracts'
import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import type { ChatRequest } from '@/lib/ai/types/chat'

const runtimeMocks = vi.hoisted(() => ({
    resumeVersionPlanTasklistAgentRun: vi.fn(),
    run: vi.fn(),
}))

vi.mock('@/lib/ai/runtime/chat-orchestrator', () => ({
    ChatOrchestrator: class ChatOrchestratorMock {
        run = runtimeMocks.run
    },
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/version-plan-tasklist-agent')>()

    return {
        ...actual,
        resumeVersionPlanTasklistAgentRun: runtimeMocks.resumeVersionPlanTasklistAgentRun,
    }
})

import { createChatService } from '@/lib/ai/chat-service'

function createResolvedTasklistContext(): ResolvedChatExecutionContext {
    const resolvedModelSelection: ResolvedModelSelection = {
        catalogItem: {
            availableIn: ['development'],
            capabilities: {
                chat: true,
                embedding: false,
                jsonOutput: true,
                streaming: true,
                tasklist: true,
                toolCalling: true,
            },
            enabled: true,
            family: 'ollama',
            id: 'ollama/qwen3-8b',
            label: 'Qwen 3 8B',
            modelKey: 'ollama/qwen3-8b',
            provider: 'ollama',
            providerModel: 'qwen3:8b',
        },
        modelId: 'ollama/qwen3-8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
        routeType: 'tasklist',
    }

    return {
        resolvedModelSelection,
        sessionId: 'session-chat-service-test',
        signal: undefined,
    }
}

function createPreparedResume(runId = 'run-resume-test') {
    return {
        conversationId: 'conv-resume-test',
        decision: { type: 'approve' },
        interrupt: {
            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
            interruptId: 'interrupt-resume-test',
            interruptKind: 'strategy_review' as const,
            nodeName: 'reviewTasklistStrategy',
            payload: {
                kind: 'strategy_review' as const,
                nodeName: 'reviewTasklistStrategy',
                runId,
                threadId: `tasklist-agent:c1:${runId}`,
            },
            runId,
            status: 'decided' as const,
            threadId: `tasklist-agent:c1:${runId}`,
        },
        run: {
            agentType: 'version-plan-to-tasklist-agent',
            agentVersion: 'v0.3.0',
            assistantMessageId: 'assistant-resume-test',
            graphVersion: 'v0.3.0',
            runId,
            status: 'resuming' as const,
        } satisfies AgentRunPublicDto,
        threadId: `tasklist-agent:c1:${runId}`,
    }
}

async function readAllChunks(response: Response) {
    const reader = response.body?.getReader()

    if (!reader) {
        return ''
    }

    const decoder = new TextDecoder()
    let output = ''

    while (true) {
        const next = await reader.read()

        if (next.done) {
            break
        }

        output += decoder.decode(next.value, { stream: true })
    }

    output += decoder.decode()

    return output
}

describe('createChatService', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        runtimeMocks.run.mockReset()
        runtimeMocks.resumeVersionPlanTasklistAgentRun.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('长时间没有业务 chunk 时写入透明心跳，并在请求结束后清理定时器', async () => {
        let finishRun: (() => void) | undefined
        runtimeMocks.run.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishRun = resolve
                })
        )

        const response = await createChatService().streamChat({} as ChatRequest, {} as ResolvedChatExecutionContext)
        const reader = response.body?.getReader()

        expect(reader).toBeDefined()
        expect(response.headers.get('X-Accel-Buffering')).toBe('no')

        const heartbeatRead = reader?.read()
        await vi.advanceTimersByTimeAsync(15_000)

        await expect(heartbeatRead).resolves.toMatchObject({
            done: false,
            value: new TextEncoder().encode('\n'),
        })

        finishRun?.()
        await expect(reader?.read()).resolves.toMatchObject({ done: true })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('Tasklist resume 在 agent-resume 之后遇到 provider 错误时保留 provider-normalized runtime error，而不是统一塌成 MODEL_STREAM_FAILED', async () => {
        runtimeMocks.resumeVersionPlanTasklistAgentRun.mockImplementation(
            async ({ writeChunk }: { writeChunk: (chunk: unknown) => void }) => {
                writeChunk({
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-resume-test',
                    interruptId: 'interrupt-resume-test',
                    runId: 'run-resume-test',
                    threadId: 'tasklist-agent:c1:run-resume-test',
                    type: 'agent-resume',
                })
                const providerError = new Error('fetch failed')
                throw providerError
            }
        )

        const response = await createChatService().resumeAgentRun(
            {
                decision: { type: 'approve' },
                interruptId: 'interrupt-resume-test',
                models: { drafting: {} as never, planning: {} as never },
                preparedResume: createPreparedResume(),
                runId: 'run-resume-test',
                runtimeConfig: { graphCheckpointMode: 'memory', graphDebugViewEnabled: false, graphEventsEnabled: false },
                userGoal: '生成 tasklist',
            },
            createResolvedTasklistContext()
        )

        const ndjson = await readAllChunks(response)

        expect(ndjson).toContain('"type":"agent-resume"')
        expect(ndjson).toContain('"type":"error"')
        expect(ndjson).toContain('"scope":"runtime"')
        expect(ndjson).toContain('"errorCode":"MODEL_PROVIDER_UNAVAILABLE"')
        expect(ndjson).toContain('本地 Ollama 模型服务连接失败，请确认 Ollama 已启动。')
        expect(ndjson).not.toContain('"errorCode":"MODEL_STREAM_FAILED"')
    })
})
