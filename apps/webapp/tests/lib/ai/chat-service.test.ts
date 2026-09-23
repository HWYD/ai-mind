import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentRunPublicDto } from '@/lib/ai/agent-runs/contracts'
import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import type { StreamEventEnvelopeDto } from '@/lib/ai/stream-recovery/contracts'
import type { StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamExecutionCoordinator, type StreamExecutionRepository } from '@/lib/ai/stream-recovery/stream-execution-coordinator'
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
            contextWindowTokens: 40000,
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

    it('只给 General ReAct 请求分配贯穿 preparation 与 projection 的 absolute deadline', async () => {
        vi.setSystemTime(10_000)
        runtimeMocks.run.mockResolvedValue(undefined)

        const service = createTestChatService()
        const ordinaryResponse = await service.streamChat(
            { conversationId: 'ordinary', messages: [] },
            withStreamRecovery(createResolvedChatContext(), 'run-ordinary')
        )
        await readAllChunks(ordinaryResponse)
        const summaryResponse = await service.streamChat(
            {
                composer: { command: { label: '/summary', name: 'summary' }, plainText: '' },
                conversationId: 'summary',
                messages: [],
            },
            withStreamRecovery(createResolvedChatContext(), 'run-summary')
        )
        await readAllChunks(summaryResponse)
        const tasklistResponse = await service.streamChat(
            {
                composer: { command: { label: '/tasklist', name: 'tasklist' }, plainText: '' },
                conversationId: 'tasklist',
                messages: [],
            },
            withStreamRecovery(createResolvedChatContext(), 'run-tasklist')
        )
        await readAllChunks(tasklistResponse)

        const contexts = runtimeMocks.chatOrchestratorOptions.map(
            options => (options as { context: ResolvedChatExecutionContext & { runDeadlineAtMs?: number } }).context
        )
        expect(contexts.map(context => context.runDeadlineAtMs)).toEqual([280_000, 280_000, undefined])
    })

    it('把 General ReAct absolute deadline 传给 durable batch projection', async () => {
        vi.setSystemTime(10_000)
        runtimeMocks.run.mockImplementation(async (options: unknown) => {
            await (options as { writeChunk: (chunk: ChatStreamChunk) => Promise<void> }).writeChunk({
                partId: 'answer',
                type: 'text-start',
            })
        })
        const projectChunks = vi.fn(async (inputs: readonly { chunk: ChatStreamChunk; runId: string }[]) =>
            inputs.map((input, index) => ({
                eventId: `evt_deadline_${index}`,
                eventKind: 'chunk' as const,
                payload: input.chunk as StreamEventEnvelopeDto['payload'],
                protocolVersion: 1 as const,
                runId: input.runId,
                sequence: index + 1,
            }))
        )

        const response = await createChatService({
            streamEventProjector: { projectChunk: vi.fn(), projectChunks },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-deadline', signal: new AbortController().signal }),
            },
        }).streamChat({ conversationId: 'deadline', messages: [] }, withStreamRecovery(createResolvedChatContext(), 'run-deadline'))
        await readAllChunks(response)

        expect(projectChunks).toHaveBeenCalledWith(expect.any(Array), { deadlineAtMs: 280_000 })
    })

    it('在 270 秒硬截止前预留 5 秒完成失败终态投影', async () => {
        vi.setSystemTime(0)
        runtimeMocks.run.mockImplementation(
            (options: unknown) =>
                new Promise<void>((_resolve, reject) => {
                    const signal = (options as { context: ResolvedChatExecutionContext }).context.signal!
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
                })
        )
        const terminalProjectionTimes: number[] = []
        const terminalProjectionOptions: Array<{ deadlineAtMs?: number } | undefined> = []
        const projectChunk = vi.fn(
            async (
                input: { chunk: ChatStreamChunk; runId: string; terminalState?: StreamEventEnvelopeDto['terminalState'] },
                options?: { deadlineAtMs?: number }
            ): Promise<StreamEventEnvelopeDto> => {
                terminalProjectionTimes.push(Date.now())
                terminalProjectionOptions.push(options)

                return {
                    eventId: 'evt_run_deadline',
                    eventKind: 'terminal',
                    payload: input.chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId: input.runId,
                    sequence: 1,
                    terminal: true,
                    terminalState: input.terminalState ?? 'failed',
                }
            }
        )

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-run-deadline', signal: new AbortController().signal }),
            },
        }).streamChat({ conversationId: 'run-deadline', messages: [] }, withStreamRecovery(createResolvedChatContext(), 'run-deadline'))
        const ndjsonPromise = readAllChunks(response)

        await vi.advanceTimersByTimeAsync(270_000)
        const ndjson = await ndjsonPromise

        expect(terminalProjectionTimes).toEqual([265_000])
        expect(terminalProjectionOptions).toEqual([{ deadlineAtMs: 270_000 }])
        expect(ndjson).toContain('"terminalState":"failed"')
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

    it('未 await 的 lifecycle/static write projection failure 仍会被捕获并追加 failed terminal，而非留下 running run', async () => {
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

    it('projection 已失败时不能以 completed terminal fallback 收口', async () => {
        runtimeMocks.run.mockImplementation(
            async ({
                writeChunk,
                writeTerminalChunk,
            }: {
                writeChunk: (chunk: ChatStreamChunk) => void
                writeTerminalChunk: (chunk: ChatStreamChunk, terminalState: StreamEventEnvelopeDto['terminalState']) => Promise<void>
            }) => {
                writeChunk({ delta: 'hello', partId: 'answer', type: 'text-delta' })
                await vi.advanceTimersByTimeAsync(0)
                await writeTerminalChunk({ type: 'finish' }, 'completed')
            }
        )

        let projectionCallCount = 0
        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
                terminalState,
            }: {
                chunk: ChatStreamChunk
                runId: string
                terminalState?: StreamEventEnvelopeDto['terminalState']
            }): Promise<StreamEventEnvelopeDto> => {
                projectionCallCount += 1
                if (projectionCallCount === 1) {
                    throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'projection failed')
                }

                return {
                    eventId: 'evt_projection_failed_terminal',
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
        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-projection-failure', signal: new AbortController().signal }),
            },
        }).streamChat({} as ChatRequest, {
            ...createResolvedChatContext(),
            streamRecovery: {
                ownerSessionHash: 'a'.repeat(64),
                runId: 'run_projection_failed_terminal',
            },
        })

        const ndjson = await readAllChunks(response)

        expect(ndjson).toContain('"terminalState":"failed"')
        expect(ndjson).not.toContain('"terminalState":"completed"')
        expect(projectChunk).toHaveBeenLastCalledWith(expect.objectContaining({ terminalState: 'failed' }), expect.anything())
    })

    it('显式取消在投影缓冲区中止后仍只持久化 cancelled terminal', async () => {
        const runId = 'run-explicit-cancelled-terminal'
        const ownerSessionHash = 'a'.repeat(64)
        const now = new Date('2026-09-16T00:00:00.000Z')
        let streamRun: StreamRunRecord = {
            agentRunId: null,
            cancelRequestedAt: null,
            completedAt: null,
            createdAt: now,
            executionOwnerId: null,
            failureCode: null,
            id: runId,
            kind: 'chat',
            lastSequence: 0,
            maxEventPayloadBytes: 262_144,
            maxRetainedEvents: 20_000,
            ownerSessionHash,
            publicFailureMessage: null,
            retentionUntil: new Date('2026-09-16T00:10:00.000Z'),
            status: 'running',
            terminalSequence: null,
            updatedAt: now,
        }
        const executionRepository: StreamExecutionRepository = {
            claimExecution: async input => {
                streamRun = { ...streamRun, executionOwnerId: input.executionOwnerId }
                return streamRun
            },
            clearExecutionOwner: async input => {
                if (streamRun.executionOwnerId === input.executionOwnerId) {
                    streamRun = { ...streamRun, executionOwnerId: null }
                }
            },
            getCancelRequestedAt: async () => streamRun.cancelRequestedAt,
            markCancelRequested: async input => {
                streamRun = { ...streamRun, cancelRequestedAt: input.now }
                return streamRun
            },
        }
        const coordinator = new StreamExecutionCoordinator(executionRepository, () => 'execution-owner-explicit-cancel')
        let startRun: (() => void) | undefined
        const runStarted = new Promise<void>(resolve => {
            startRun = resolve
        })
        runtimeMocks.run.mockImplementation(
            ({ context }: { context: ResolvedChatExecutionContext }) =>
                new Promise<void>((_resolve, reject) => {
                    context.signal?.addEventListener('abort', () => reject(new DOMException('explicit cancellation', 'AbortError')), {
                        once: true,
                    })
                    startRun?.()
                })
        )

        const persistedEvents: StreamEventEnvelopeDto[] = []
        const response = await createChatService({
            streamEventProjector: {
                projectChunk: async ({ chunk, runId: projectedRunId, terminalState }) => {
                    const event: StreamEventEnvelopeDto = {
                        eventId: 'evt_explicit_cancelled_terminal',
                        eventKind: 'terminal',
                        payload: chunk as StreamEventEnvelopeDto['payload'],
                        protocolVersion: 1,
                        runId: projectedRunId,
                        sequence: 1,
                        terminal: true,
                        terminalState: terminalState!,
                    }
                    persistedEvents.push(event)
                    return event
                },
            },
            streamExecutionCoordinator: coordinator,
        }).streamChat({ conversationId: 'explicit-cancel', messages: [] }, withStreamRecovery(createResolvedChatContext(), runId))

        await runStarted
        await coordinator.requestCancel({ now, ownerSessionHash, runId })
        const ndjson = await readAllChunks(response)

        expect(persistedEvents).toEqual([
            expect.objectContaining({
                eventKind: 'terminal',
                payload: { type: 'finish' },
                terminalState: 'cancelled',
            }),
        ])
        expect(ndjson.match(/"eventKind":"terminal"/g)).toHaveLength(1)
        expect(ndjson).toContain('"terminalState":"cancelled"')
        expect(ndjson).not.toContain('"terminalState":"failed"')
        expect(ndjson).not.toContain('"terminalState":"completed"')
        expect(ndjson).not.toContain('thread-memory-status')
    })

    it('并发终态只由 first terminal 收口', async () => {
        runtimeMocks.run.mockImplementation(
            async ({
                writeTerminalChunk,
            }: {
                writeTerminalChunk: (chunk: ChatStreamChunk, terminalState: StreamEventEnvelopeDto['terminalState']) => Promise<void>
            }) => {
                await Promise.all([
                    writeTerminalChunk({ type: 'finish' }, 'completed'),
                    writeTerminalChunk(
                        {
                            errorCode: 'RUNTIME_INVARIANT_FAILED',
                            message: 'second terminal',
                            retryable: false,
                            scope: 'runtime',
                            stage: 'runtime',
                            type: 'error',
                        },
                        'failed'
                    ),
                ])
            }
        )

        const committedTerminalStates: StreamEventEnvelopeDto['terminalState'][] = []
        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
                terminalState,
            }: {
                chunk: ChatStreamChunk
                runId: string
                terminalState?: StreamEventEnvelopeDto['terminalState']
            }): Promise<StreamEventEnvelopeDto> => {
                if (terminalState) {
                    committedTerminalStates.push(terminalState)
                }

                return {
                    eventId: `evt_concurrent_${committedTerminalStates.length}`,
                    eventKind: 'terminal',
                    payload: chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId,
                    sequence: committedTerminalStates.length,
                    terminal: true,
                    terminalState: terminalState!,
                }
            }
        )
        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-concurrent-terminal', signal: new AbortController().signal }),
            },
        }).streamChat({} as ChatRequest, withStreamRecovery(createResolvedChatContext(), 'run-concurrent-terminal'))

        const ndjson = await readAllChunks(response)

        expect(committedTerminalStates).toEqual(['completed'])
        expect(ndjson.match(/"eventKind":"terminal"/g)).toHaveLength(1)
    })

    it('并发终态的 first projection failure 只以一个 failed terminal 收口', async () => {
        runtimeMocks.run.mockImplementation(
            async ({
                writeTerminalChunk,
            }: {
                writeTerminalChunk: (chunk: ChatStreamChunk, terminalState: StreamEventEnvelopeDto['terminalState']) => Promise<void>
            }) => {
                await Promise.all([
                    writeTerminalChunk({ type: 'finish' }, 'completed'),
                    writeTerminalChunk(
                        {
                            errorCode: 'RUNTIME_INVARIANT_FAILED',
                            message: 'second terminal',
                            retryable: false,
                            scope: 'runtime',
                            stage: 'runtime',
                            type: 'error',
                        },
                        'failed'
                    ),
                ])
            }
        )

        let projectionCallCount = 0
        const committedTerminalStates: StreamEventEnvelopeDto['terminalState'][] = []
        const projectChunk = vi.fn(
            async ({
                chunk,
                runId,
                terminalState,
            }: {
                chunk: ChatStreamChunk
                runId: string
                terminalState?: StreamEventEnvelopeDto['terminalState']
            }): Promise<StreamEventEnvelopeDto> => {
                projectionCallCount += 1
                if (projectionCallCount === 1) {
                    throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'first terminal projection failed')
                }

                committedTerminalStates.push(terminalState!)
                return {
                    eventId: `evt_concurrent_failure_${projectionCallCount}`,
                    eventKind: 'terminal',
                    payload: chunk as StreamEventEnvelopeDto['payload'],
                    protocolVersion: 1,
                    runId,
                    sequence: committedTerminalStates.length,
                    terminal: true,
                    terminalState: terminalState!,
                }
            }
        )
        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-concurrent-projection-failure', signal: new AbortController().signal }),
            },
        }).streamChat({} as ChatRequest, withStreamRecovery(createResolvedChatContext(), 'run-concurrent-projection-failure'))

        const ndjson = await readAllChunks(response)

        expect(committedTerminalStates).toEqual(['failed'])
        expect(ndjson.match(/"eventKind":"terminal"/g)).toHaveLength(1)
        expect(ndjson).not.toContain('"terminalState":"completed"')
    })

    it('连续投影失败时仍执行一次 run-owned cleanup', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const order: string[] = []
        const release = vi.fn(() => order.push('release'))
        runtimeMocks.run.mockImplementation(
            async ({
                deferCleanup,
                writeChunk,
            }: {
                deferCleanup: (cleanup: () => void) => void
                writeChunk: (chunk: ChatStreamChunk) => Promise<void>
            }) => {
                deferCleanup(release)
                await writeChunk({ delta: 'hello', partId: 'answer', type: 'text-delta' }).catch(() => undefined)
            }
        )

        let projectionCallCount = 0
        const projectChunk = vi.fn(async ({ chunk, runId }: { chunk: ChatStreamChunk; runId: string }): Promise<StreamEventEnvelopeDto> => {
            projectionCallCount += 1
            order.push(`project-${projectionCallCount}`)
            if (projectionCallCount <= 2) {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'projection failed')
            }

            return {
                eventId: 'evt_cleanup_failed',
                eventKind: 'terminal',
                payload: chunk as StreamEventEnvelopeDto['payload'],
                protocolVersion: 1,
                runId,
                sequence: 1,
                terminal: true,
                terminalState: 'failed',
            }
        })

        const response = await createChatService({
            streamEventProjector: { projectChunk },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-cleanup', signal: new AbortController().signal }),
            },
        }).streamChat(
            { conversationId: 'cleanup-failure', messages: [] },
            withStreamRecovery(createResolvedChatContext(), 'run-cleanup-failure')
        )

        await readAllChunks(response)

        expect(projectChunk).toHaveBeenCalledTimes(3)
        expect(release).toHaveBeenCalledTimes(1)
        expect(order).toEqual(['project-1', 'project-2', 'project-3', 'release'])
    })

    it('一个 deferred cleanup 抛错时仍执行剩余的 run-owned cleanup', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const cleanups: string[] = []
        runtimeMocks.run.mockImplementation(async ({ deferCleanup }: { deferCleanup: (cleanup: () => void) => void }) => {
            deferCleanup(() => {
                cleanups.push('first')
            })
            deferCleanup(() => {
                cleanups.push('throwing')
                throw new Error('cleanup failed')
            })
            deferCleanup(() => {
                cleanups.push('last')
            })
        })

        const response = await createChatService({
            streamEventProjector: {
                projectChunk: vi.fn(
                    async ({ chunk, runId }: { chunk: ChatStreamChunk; runId: string }): Promise<StreamEventEnvelopeDto> => ({
                        eventId: 'evt_cleanup_isolated',
                        eventKind: 'terminal',
                        payload: chunk as StreamEventEnvelopeDto['payload'],
                        protocolVersion: 1,
                        runId,
                        sequence: 1,
                        terminal: true,
                        terminalState: 'failed',
                    })
                ),
            },
            streamExecutionCoordinator: {
                getCancelRequestedAt: async () => null,
                startExecution: async ({ execute }) =>
                    execute({ executionOwnerId: 'execution-owner-cleanup-isolated', signal: new AbortController().signal }),
            },
        }).streamChat(
            { conversationId: 'cleanup-isolated', messages: [] },
            withStreamRecovery(createResolvedChatContext(), 'run-cleanup-isolated')
        )

        await readAllChunks(response)

        expect(cleanups).toEqual(['last', 'throwing', 'first'])
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
