import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentRunPublicDto } from '@/lib/ai/agent-runs/contracts'
import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import type { StreamEventEnvelopeDto } from '@/lib/ai/stream-recovery/contracts'
import { StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'
import type { ChatRequest } from '@/lib/ai/types/chat'

const runtimeMocks = vi.hoisted(() => ({
    chatOrchestratorOptions: [] as unknown[],
    resumeVersionPlanTasklistAgentRun: vi.fn(),
    run: vi.fn(),
}))

vi.mock('@/lib/ai/runtime/chat-orchestrator', () => ({
    ChatOrchestrator: class ChatOrchestratorMock {
        constructor(private readonly options: unknown) {
            runtimeMocks.chatOrchestratorOptions.push(options)
        }

        run() {
            return runtimeMocks.run(this.options)
        }
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

function createResolvedChatContext(): ResolvedChatExecutionContext {
    const context = createResolvedTasklistContext()

    return {
        ...context,
        resolvedModelSelection: {
            ...context.resolvedModelSelection,
            routeType: 'chat',
        },
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

function createTestChatService() {
    let sequence = 0

    return createChatService({
        streamEventProjector: {
            projectChunk: async ({ chunk, runId, terminalState }) => {
                sequence += 1
                return {
                    eventId: `evt_${sequence}`,
                    eventKind: terminalState ? 'terminal' : 'chunk',
                    payload: chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId,
                    sequence,
                    ...(terminalState ? { terminal: true, terminalState, runStatus: terminalState } : { runStatus: 'running' }),
                }
            },
        },
        streamExecutionCoordinator: {
            getCancelRequestedAt: async () => null,
            startExecution: async ({ execute }) =>
                execute({ executionOwnerId: 'execution-owner-test', signal: new AbortController().signal }),
        },
    })
}

function withStreamRecovery(context: ResolvedChatExecutionContext, runId = 'run-chat-service-test'): ResolvedChatExecutionContext {
    return {
        ...context,
        streamRecovery: {
            ownerSessionHash: 'a'.repeat(64),
            requestSignal: new AbortController().signal,
            runId,
        },
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
        runtimeMocks.chatOrchestratorOptions.length = 0
        runtimeMocks.run.mockReset()
        runtimeMocks.resumeVersionPlanTasklistAgentRun.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('长时间没有业务 chunk 时写入透明心跳，并在请求结束后清理定时器', async () => {
        let finishRun: (() => void) | undefined
        runtimeMocks.run.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishRun = resolve
                })
        )

        const response = await createTestChatService().streamChat({} as ChatRequest, withStreamRecovery(createResolvedChatContext()))
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

    it('resumable 模式下先把业务 chunk 投影成 envelope，再写入响应流', async () => {
        runtimeMocks.run.mockImplementation(async ({ writeChunk }: { writeChunk: (chunk: ChatStreamChunk) => void }) => {
            writeChunk({
                delta: 'hello',
                partId: 'answer',
                type: 'text-delta',
            })
            writeChunk({
                type: 'finish',
            })
        })

        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
            }: {
                chunk: ChatStreamChunk
                ownerSessionHash: string
                runId: string
            }): Promise<StreamEventEnvelopeDto> => ({
                eventId: chunk.type === 'finish' ? 'evt_done' : 'evt_1',
                eventKind: chunk.type === 'finish' ? 'terminal' : 'chunk',
                payload: chunk as StreamEventEnvelopeDto['payload'],
                protocolVersion: 1,
                runId,
                sequence: chunk.type === 'finish' ? 2 : 1,
                ...(chunk.type === 'finish'
                    ? {
                          terminal: true,
                          terminalState: 'completed',
                      }
                    : {
                          runStatus: 'running',
                      }),
            })
        )
        const requestController = new AbortController()
        const startExecution = vi.fn(
            async ({ execute }: { execute: (execution: { executionOwnerId: string; signal: AbortSignal }) => Promise<void> }) => {
                await execute({
                    executionOwnerId: 'execution-owner-1',
                    signal: new AbortController().signal,
                })
            }
        )

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: { startExecution: startExecution as never },
        }).streamChat({} as ChatRequest, {
            ...createResolvedChatContext(),
            signal: undefined,
            streamRecovery: {
                ownerSessionHash: 'a'.repeat(64),
                requestSignal: requestController.signal,
                runId: 'run_1',
            },
        })

        const ndjson = await readAllChunks(response)

        expect(startExecution).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerSessionHash: 'a'.repeat(64),
                requestSignal: requestController.signal,
                runId: 'run_1',
            })
        )
        expect(projectChunk).toHaveBeenCalledTimes(2)
        expect(projectChunk).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                ownerSessionHash: 'a'.repeat(64),
                runId: 'run_1',
            })
        )
        expect(ndjson).toContain(
            '{"eventId":"evt_1","eventKind":"chunk","payload":{"delta":"hello","partId":"answer","type":"text-delta"},"protocolVersion":1,"runId":"run_1","sequence":1,"runStatus":"running"}\n'
        )
        expect(ndjson).toContain(
            '{"eventId":"evt_done","eventKind":"terminal","payload":{"type":"finish"},"protocolVersion":1,"runId":"run_1","sequence":2,"terminal":true,"terminalState":"completed"}\n'
        )
        expect(ndjson).not.toContain('{"delta":"hello","partId":"answer","type":"text-delta"}\n')
    })

    it('projects a failed terminal when the resumable executor cannot start', async () => {
        const projectionLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const projectChunk = vi.fn(
            async ({ chunk, runId }: { chunk: ChatStreamChunk; runId: string }): Promise<StreamEventEnvelopeDto> => ({
                eventId: 'evt_start_failed',
                eventKind: 'terminal',
                payload: chunk as StreamEventEnvelopeDto['payload'],
                protocolVersion: 1,
                runId,
                sequence: 1,
                terminal: true,
                terminalState: 'failed',
            })
        )
        const startExecution = vi.fn(async () => {
            throw new Error('execution repository unavailable')
        })

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: { startExecution: startExecution as never },
        }).streamChat({} as ChatRequest, {
            ...createResolvedChatContext(),
            streamRecovery: {
                ownerSessionHash: 'a'.repeat(64),
                runId: 'run_start_failure',
            },
        })

        const ndjson = await readAllChunks(response)

        expect(runtimeMocks.run).not.toHaveBeenCalled()
        expect(projectChunk).toHaveBeenCalledWith(
            expect.objectContaining({
                runId: 'run_start_failure',
                terminalState: 'failed',
            })
        )
        expect(ndjson).toContain('"terminalState":"failed"')
        expect(projectionLog).toHaveBeenCalledWith('Chat stream failed:', expect.any(Error))
    })

    it('resumable event projection failure emits failed terminal instead of leaving the run running', async () => {
        const projectionLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        runtimeMocks.run.mockImplementation(async ({ writeChunk }: { writeChunk: (chunk: ChatStreamChunk) => void }) => {
            writeChunk({
                delta: 'hello',
                partId: 'answer',
                type: 'text-delta',
            })
            writeChunk({ type: 'finish' })
        })

        let projectionCallCount = 0
        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
                terminalState,
            }: {
                chunk: ChatStreamChunk
                ownerSessionHash: string
                runId: string
                terminalState?: StreamEventEnvelopeDto['terminalState']
            }): Promise<StreamEventEnvelopeDto> => {
                projectionCallCount += 1

                if (projectionCallCount === 1) {
                    throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Public stream payload contains secret-like data.')
                }

                return {
                    eventId: 'evt_failed',
                    eventKind: 'terminal',
                    payload: chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId,
                    sequence: 1,
                    terminal: true,
                    terminalState: terminalState ?? 'failed',
                }
            }
        )
        const startExecution = vi.fn(
            async ({ execute }: { execute: (execution: { executionOwnerId: string; signal: AbortSignal }) => Promise<void> }) =>
                execute({
                    executionOwnerId: 'execution-owner-1',
                    signal: new AbortController().signal,
                })
        )

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: { startExecution: startExecution as never },
        }).streamChat({} as ChatRequest, {
            ...createResolvedChatContext(),
            streamRecovery: {
                ownerSessionHash: 'a'.repeat(64),
                runId: 'run_projection_failure',
            },
        })

        const ndjson = await readAllChunks(response)

        expect(projectChunk).toHaveBeenCalledTimes(2)
        expect(ndjson).toContain('"eventKind":"terminal"')
        expect(ndjson).toContain('"errorCode":"RUNTIME_INVARIANT_FAILED"')
        expect(ndjson).toContain('"terminalState":"failed"')
        expect(ndjson).not.toContain('"terminalState":"completed"')
        expect(projectionLog).toHaveBeenCalledWith('Resumable stream event projection failed:', {
            code: 'STREAM_EVENT_INVALID',
        })
    })

    it('resumable 模式下响应 cancel 不会让后台执行流的 isClosed 变成 true', async () => {
        vi.useRealTimers()

        let capturedIsClosed: (() => boolean) | undefined
        let finishRun: (() => void) | undefined
        const runStarted = new Promise<void>(resolve => {
            runtimeMocks.run.mockImplementation(({ isClosed }: { isClosed: () => boolean }) => {
                capturedIsClosed = isClosed
                resolve()

                return new Promise<void>(finish => {
                    finishRun = finish
                })
            })
        })
        const startExecution = vi.fn(
            async ({ execute }: { execute: (execution: { executionOwnerId: string; signal: AbortSignal }) => Promise<void> }) =>
                execute({
                    executionOwnerId: 'execution-owner-1',
                    signal: new AbortController().signal,
                })
        )

        const response = await createChatService({
            streamExecutionCoordinator: { startExecution: startExecution as never },
            streamEventProjector: {
                projectChunk: vi.fn(),
            },
        }).streamChat({} as ChatRequest, {
            ...createResolvedChatContext(),
            signal: undefined,
            streamRecovery: {
                ownerSessionHash: 'a'.repeat(64),
                runId: 'run_1',
            },
        })
        const reader = response.body?.getReader()

        await runStarted
        await reader?.cancel()

        expect(capturedIsClosed?.()).toBe(false)

        finishRun?.()
    })

    it('resumable rejectAgentRun 使用 rejected terminal envelope 收口，同时保留 finish payload 兼容 UI', async () => {
        let sequence = 0
        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
                terminalState,
            }: {
                chunk: ChatStreamChunk
                ownerSessionHash: string
                runId: string
                terminalState?: StreamEventEnvelopeDto['terminalState']
            }): Promise<StreamEventEnvelopeDto> => {
                sequence += 1

                return {
                    eventId: `evt_${sequence}`,
                    eventKind: terminalState ? 'terminal' : 'chunk',
                    payload: chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId,
                    sequence,
                    ...(terminalState ? { terminal: true, terminalState } : {}),
                }
            }
        )
        const startExecution = vi.fn(
            async ({ execute }: { execute: (execution: { executionOwnerId: string; signal: AbortSignal }) => Promise<void> }) =>
                execute({
                    executionOwnerId: 'execution-owner-1',
                    signal: new AbortController().signal,
                })
        )

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: { startExecution: startExecution as never },
        }).rejectAgentRun(
            {
                assistantMessageId: 'assistant_reject',
                interruptId: 'interrupt_reject',
                runId: 'run_reject',
                summary: '已终止。',
                threadId: 'tasklist-agent:c1:run_reject',
            },
            {
                sessionId: 'session-chat-service-test',
                streamRecovery: {
                    ownerSessionHash: 'a'.repeat(64),
                    runId: 'run_reject',
                },
            }
        )

        const ndjson = await readAllChunks(response)

        expect(projectChunk).toHaveBeenLastCalledWith(
            expect.objectContaining({
                chunk: { type: 'finish' },
                terminalState: 'rejected',
            })
        )
        expect(ndjson).toContain(
            '{"eventId":"evt_5","eventKind":"terminal","payload":{"type":"finish"},"protocolVersion":1,"runId":"run_reject","sequence":5,"terminal":true,"terminalState":"rejected"}\n'
        )
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

        const response = await createTestChatService().resumeAgentRun(
            {
                decision: { type: 'approve' },
                interruptId: 'interrupt-resume-test',
                models: { drafting: {} as never, planning: {} as never },
                preparedResume: createPreparedResume(),
                runId: 'run-resume-test',
                runtimeConfig: { graphCheckpointMode: 'memory', graphDebugViewEnabled: false, graphEventsEnabled: false },
                userGoal: '生成 tasklist',
            },
            withStreamRecovery(createResolvedTasklistContext(), 'run-resume-test')
        )

        const ndjson = await readAllChunks(response)

        expect(ndjson).toContain('"type":"agent-resume"')
        expect(ndjson).toContain('"type":"error"')
        expect(ndjson).toContain('"scope":"runtime"')
        expect(ndjson).toContain('"errorCode":"MODEL_PROVIDER_UNAVAILABLE"')
        expect(ndjson).toContain('本地 Ollama 模型服务连接失败，请确认 Ollama 已启动。')
        expect(ndjson).not.toContain('"errorCode":"MODEL_STREAM_FAILED"')
    })

    it('Tasklist resume 再次进入人工审核时保持 paused，不追加 finish completed', async () => {
        runtimeMocks.resumeVersionPlanTasklistAgentRun.mockImplementation(
            async ({ writeChunk }: { writeChunk: (chunk: ChatStreamChunk) => void }) => {
                writeChunk({
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-resume-test',
                    interruptId: 'interrupt-resume-test',
                    runId: 'run-resume-test',
                    threadId: 'tasklist-agent:c1:run-resume-test',
                    type: 'agent-resume',
                })
                writeChunk({
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-resume-test',
                    interruptId: 'interrupt-next-review',
                    interruptKind: 'tasklist_revision_review',
                    payload: {
                        kind: 'tasklist_revision_review',
                        nodeName: 'reviewTasklistRevision',
                        runId: 'run-resume-test',
                        threadId: 'tasklist-agent:c1:run-resume-test',
                    },
                    runId: 'run-resume-test',
                    threadId: 'tasklist-agent:c1:run-resume-test',
                    type: 'agent-interrupt',
                })

                return {
                    graphResult: { status: 'interrupted' },
                    run: createPreparedResume().run,
                }
            }
        )

        const response = await createTestChatService().resumeAgentRun(
            {
                decision: { type: 'approve' },
                interruptId: 'interrupt-resume-test',
                models: { drafting: {} as never, planning: {} as never },
                preparedResume: createPreparedResume(),
                runId: 'run-resume-test',
                runtimeConfig: { graphCheckpointMode: 'memory', graphDebugViewEnabled: false, graphEventsEnabled: false },
                userGoal: '鐢熸垚 tasklist',
            },
            withStreamRecovery(createResolvedTasklistContext(), 'run-resume-test')
        )

        const ndjson = await readAllChunks(response)

        expect(ndjson).toContain('"type":"agent-resume"')
        expect(ndjson).toContain('"type":"agent-interrupt"')
        expect(ndjson).not.toContain('"type":"finish"')
    })
})
