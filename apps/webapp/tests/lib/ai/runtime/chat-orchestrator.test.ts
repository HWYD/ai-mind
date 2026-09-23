import { type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InputLengthExceededError } from '@/lib/ai/model-provider'
import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import { TASKLIST_AGENT_MODEL_POLICIES } from '@/lib/ai/runtime/version-plan-tasklist-agent/model/tasklist-agent-model-set'
import { calculatorToolDefinition } from '@/lib/ai/tools/calculator-tool'

const runtimeMocks = vi.hoisted(() => {
    return {
        buildSystemMessages: vi.fn(),
        getTrustedUserUrlCatalogSystemPrompt: vi.fn(),
        appendCompletedTurn: vi.fn(),
        createChatContextPreflight: vi.fn(),
        prepareChatContext: vi.fn(),
        readThreadState: vi.fn(),
        buildChatMemoryContextMessages: vi.fn(),
        buildUserMemoryContextMessages: vi.fn(),
        touchConversation: vi.fn(),
        createChatSession: vi.fn(),
        executeComposerContextInvocation: vi.fn(),
        prepareComposerContextInvocation: vi.fn(),
        processCompletedTurnForMemory: vi.fn(),
        resolveComposerContextInvocation: vi.fn(),
        retrieveRelevantMemories: vi.fn(),
        startDeliveryChainRun: vi.fn(),
        startVersionPlanTasklistAgentRun: vi.fn(),
        writeStaticTextPart: vi.fn(),
        createGeneralReActRunContext: vi.fn(),
        runGeneralReAct: vi.fn(),
    }
})

vi.mock('@/lib/ai/runtime/chat-session', () => ({
    buildSystemMessages: runtimeMocks.buildSystemMessages,
    createChatSession: runtimeMocks.createChatSession,
    getTrustedUserUrlCatalogSystemPrompt: runtimeMocks.getTrustedUserUrlCatalogSystemPrompt,
    withChatMemoryContextMessages: (messages: BaseMessage[], memoryContextMessages: BaseMessage[]) => {
        if (memoryContextMessages.length === 0) {
            return messages
        }

        const firstNonSystemIndex = messages.findIndex(message => message._getType() !== 'system')

        if (firstNonSystemIndex === -1) {
            return [...messages, ...memoryContextMessages]
        }

        return [...messages.slice(0, firstNonSystemIndex), ...memoryContextMessages, ...messages.slice(firstNonSystemIndex)]
    },
}))

vi.mock('@/lib/ai/runtime/chat-memory', () => ({
    buildChatMemoryContextMessages: runtimeMocks.buildChatMemoryContextMessages,
    buildChatConversationThreadId: (sessionId: string, conversationId: string) => `chat-conversation:${sessionId}:${conversationId}`,
    chatMemoryService: {
        appendCompletedTurn: runtimeMocks.appendCompletedTurn,
        readThreadState: runtimeMocks.readThreadState,
    },
    conversationRegistryService: {
        touchConversation: runtimeMocks.touchConversation,
    },
    isChatMemoryContextEligibleRequest: (request: { composer?: { command?: { name?: string } } }) =>
        request.composer?.command?.name !== 'tasklist' && request.composer?.command?.name !== 'delivery-chain',
    isChatMemoryWriteEligibleRequest: (
        request: { composer?: { command?: { name?: string } } },
        source: 'chat' | 'delivery-chain' | 'mcp-resource' | 'tasklist-agent' | 'tool'
    ) => {
        if (source === 'tasklist-agent') {
            return request.composer?.command?.name === 'tasklist'
        }

        if (source === 'delivery-chain') {
            return request.composer?.command?.name === 'delivery-chain'
        }

        return request.composer?.command?.name !== 'tasklist' && request.composer?.command?.name !== 'delivery-chain'
    },
}))

vi.mock('@/lib/ai/runtime/chat-context-preflight', () => ({
    createChatContextPreflight: runtimeMocks.createChatContextPreflight,
}))

vi.mock('@/lib/ai/runtime/composer-context', () => ({
    executeComposerContextInvocation: runtimeMocks.executeComposerContextInvocation,
    prepareComposerContextInvocation: runtimeMocks.prepareComposerContextInvocation,
    resolveComposerContextInvocation: runtimeMocks.resolveComposerContextInvocation,
}))

vi.mock('@/lib/ai/runtime/user-memory', () => ({
    buildUserMemoryContextMessages: runtimeMocks.buildUserMemoryContextMessages,
    processCompletedTurnForMemory: runtimeMocks.processCompletedTurnForMemory,
    userMemoryService: {
        retrieveRelevantMemories: runtimeMocks.retrieveRelevantMemories,
    },
}))

vi.mock('@/lib/ai/runtime/delivery-chain', () => ({
    startDeliveryChainRun: runtimeMocks.startDeliveryChainRun,
}))

vi.mock('@ai-mind/stream-core', async importOriginal => {
    const actual = await importOriginal<typeof import('@ai-mind/stream-core')>()

    return {
        ...actual,
        writeStaticTextPart: runtimeMocks.writeStaticTextPart,
    }
})

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/version-plan-tasklist-agent')>()

    return {
        ...actual,
        startVersionPlanTasklistAgentRun: runtimeMocks.startVersionPlanTasklistAgentRun,
    }
})

vi.mock('@/lib/ai/runtime/general-react-agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/runtime/general-react-agent')>()

    return {
        ...actual,
        createGeneralReActRunContext: runtimeMocks.createGeneralReActRunContext,
        GeneralReActAgentRunner: class {
            run(input: unknown) {
                return runtimeMocks.runGeneralReAct(input)
            }
        },
    }
})

import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'
import { generalReActExecutionGate } from '@/lib/ai/runtime/general-react-agent/execution-gate'

function createRequest() {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        type: 'text' as const,
                        format: 'markdown' as const,
                        text: '你好',
                    },
                ],
            },
        ],
        options: {},
    }
}

function createTasklistRequest() {
    return {
        ...createRequest(),
        composer: {
            command: {
                label: '生成任务清单',
                name: 'tasklist' as const,
            },
            plainText: '',
            references: [
                {
                    id: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                    label: 'v0.2.0-controlled-agent-graph.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                },
            ],
        },
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        type: 'text' as const,
                        format: 'markdown' as const,
                        text: '基于这个版本方案生成 tasklist 草稿',
                    },
                ],
            },
        ],
    }
}

function createSummaryDocsRequest() {
    return {
        ...createRequest(),
        composer: {
            command: {
                label: '总结文档',
                name: 'summary' as const,
            },
            plainText: '',
            references: [
                {
                    id: 'demo://README.md',
                    label: 'README.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'demo://README.md',
                },
            ],
        },
    }
}

function createDeliveryChainRequest() {
    return {
        ...createRequest(),
        composer: {
            command: {
                label: '生成交付计划',
                name: 'delivery-chain' as const,
            },
            plainText: '帮我规划一个登录表单，支持手机号和错误提示',
        },
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        type: 'text' as const,
                        format: 'markdown' as const,
                        text: '帮我规划一个登录表单，支持手机号和错误提示',
                    },
                ],
            },
        ],
    }
}

function createCheckRequest() {
    return {
        ...createRequest(),
        composer: {
            command: {
                label: '检查文档一致性',
                name: 'check' as const,
            },
            plainText: '',
            references: [
                {
                    id: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                    label: 'v0.2.0-controlled-agent-graph.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'demo://version-plans/v0.2.0-controlled-agent-graph.md',
                },
            ],
        },
    }
}

function createSession(overrides: Record<string, unknown> = {}) {
    const baseModelStream = vi.fn().mockResolvedValue({ name: 'base-stream' })
    const modelHandle = {
        capabilities: {
            jsonOutput: true,
            reasoning: true,
            streaming: true,
            toolCalling: true,
            usageInStream: true,
        },
        model: {
            stream: baseModelStream,
        },
        normalizeError: vi.fn().mockReturnValue({
            code: 'MODEL_STREAM_FAILED',
            logMeta: {},
            message: 'Model streaming failed.',
            retryable: true,
        }),
    }

    return {
        request: createRequest(),
        baseModel: {
            stream: baseModelStream,
        },
        modelHandle,
        skillDefinition: undefined,
        skillSystemPrompt: undefined,
        skillOutputPolicyPrompt: undefined,
        finalizerSystemPrompts: [],
        loopSystemPrompts: [],
        activeTools: [],
        activeToolNames: [],
        langChainMessages: [],
        toolUseSystemPrompt: undefined,
        toolResultSystemPrompt: undefined,
        ...overrides,
    }
}

function createExecutionContext(): ResolvedChatExecutionContext {
    return {
        resolvedModelSelection: {
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
                label: 'qwen3-8b',
                modelKey: 'qwen3-8b',
                provider: 'ollama',
                providerModel: 'qwen3:8b',
            },
            modelId: 'ollama/qwen3-8b',
            provider: 'ollama',
            providerModel: 'qwen3:8b',
            routeType: 'chat',
        },
        sessionId: 'test-session',
    }
}

function collectChunkTypes(chunks: Array<{ type: string; scope?: string }>) {
    return chunks.map(chunk => (chunk.type === 'error' ? `${chunk.type}:${chunk.scope ?? 'unknown'}` : chunk.type))
}

function expectSingleTerminalChunk(chunks: Array<{ type: string; scope?: string }>) {
    const terminalChunks = chunks.filter(chunk => chunk.type === 'finish' || (chunk.type === 'error' && chunk.scope === 'runtime'))
    expect(terminalChunks.length).toBeLessThanOrEqual(1)
}

describe('runtime/chat-orchestrator', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        runtimeMocks.buildSystemMessages.mockReturnValue([])
        runtimeMocks.getTrustedUserUrlCatalogSystemPrompt.mockReturnValue(undefined)
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([])
        runtimeMocks.buildUserMemoryContextMessages.mockReturnValue([])
        runtimeMocks.touchConversation.mockResolvedValue(undefined)
        runtimeMocks.readThreadState.mockResolvedValue({
            restored: false,
            state: {
                messages: [],
                pinnedDecisions: [],
                summary: '',
            },
        })
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue(null)
        runtimeMocks.executeComposerContextInvocation.mockResolvedValue([])
        runtimeMocks.prepareComposerContextInvocation.mockResolvedValue({ messages: [], nonMessagePayloads: [] })
        runtimeMocks.processCompletedTurnForMemory.mockResolvedValue({
            candidates: 0,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 0,
        })
        runtimeMocks.retrieveRelevantMemories.mockResolvedValue([])
        runtimeMocks.startDeliveryChainRun.mockResolvedValue(false)
        runtimeMocks.startVersionPlanTasklistAgentRun.mockResolvedValue({
            graphResult: {
                status: 'completed',
            },
            graphState: {},
            state: {},
        })
        runtimeMocks.createGeneralReActRunContext.mockReturnValue({
            runSignal: new AbortController().signal,
        })
        runtimeMocks.runGeneralReAct.mockResolvedValue({
            assistantText: '通用 Agent 回答',
            executedToolCallCount: 0,
            finalizationMode: 'normal',
            modelCallCount: 1,
            modelRetryCount: 0,
            source: 'chat',
            sources: [],
            stopReason: 'natural_completion',
            toolCallCount: 0,
            toolRequestCount: 0,
            toolRetryCount: 0,
        })
        runtimeMocks.prepareChatContext.mockImplementation(async (assemble: (memoryMessages: BaseMessage[]) => unknown[]) => ({
            messages: assemble([]),
        }))
        runtimeMocks.createChatContextPreflight.mockReturnValue({
            prepare: runtimeMocks.prepareChatContext,
        })
        vi.unstubAllEnvs()
    })

    it('非专用 chat 即使缺少旧 session 字段也只进入 General ReAct runner', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const context = createExecutionContext()

        const orchestrator = new ChatOrchestrator({
            context,
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.createChatSession).toHaveBeenCalledWith(createRequest(), context.resolvedModelSelection)
        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
        expect(generalReActExecutionGate.activeCount()).toBe(0)
    })

    it('普通 chat 使用 General ReAct runner，并按实际工具执行 source 写入 Memory', async () => {
        const session = createSession({
            activeToolDefinitionMap: new Map([['calculator', calculatorToolDefinition]]),
            activeToolNames: ['calculator'],
            activeTools: [calculatorToolDefinition],
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.runGeneralReAct.mockResolvedValueOnce({
            assistantText: '2',
            executedToolCallCount: 1,
            finalizationMode: 'normal',
            modelCallCount: 2,
            modelRetryCount: 0,
            source: 'tool',
            sources: [],
            stopReason: 'natural_completion',
            toolCallCount: 1,
            toolRequestCount: 1,
            toolRetryCount: 0,
        })

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        }).run()

        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.runGeneralReAct.mock.calls[0]?.[0]).toMatchObject({
            context: expect.any(Object),
            messages: expect.any(Array),
        })
        expect(runtimeMocks.appendCompletedTurn).toHaveBeenCalledWith(
            'chat-conversation:test-session:test-conversation',
            expect.objectContaining({ source: 'tool', assistantText: '2' }),
            expect.any(Object)
        )
        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'tool_assisted_ordinary_chat' })
        )
        expect(generalReActExecutionGate.activeCount()).toBe(0)
    })

    it('只把已验证同会话的服务端原始 user URL 交给 General ReAct，不接受 assistant 或摘要链接', async () => {
        runtimeMocks.createChatSession.mockReturnValue(createSession())
        runtimeMocks.readThreadState.mockResolvedValueOnce({
            restored: true,
            state: {
                messages: [
                    {
                        id: 'user-old',
                        role: 'user',
                        text: '请记住 https://docs.example.com/old#chapter',
                        createdAt: '2026-09-23T00:00:00.000Z',
                    },
                    {
                        id: 'assistant-old',
                        role: 'assistant',
                        text: '也许可以读取 https://assistant.example.com/hidden',
                        createdAt: '2026-09-23T00:00:01.000Z',
                    },
                ],
                pinnedDecisions: ['https://pinned.example.com/not-a-grant'],
                summary: 'https://summary.example.com/not-a-grant',
            },
        })

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        }).run()

        expect(runtimeMocks.createGeneralReActRunContext).toHaveBeenCalledWith(
            expect.objectContaining({ trustedUserUrls: ['https://docs.example.com/old'] })
        )
        expect(runtimeMocks.readThreadState).toHaveBeenCalledWith('chat-conversation:test-session:test-conversation', expect.any(Object))
    })

    it('不把压缩后只存在于摘要中的 URL 作为 read-url grant', async () => {
        runtimeMocks.createChatSession.mockReturnValue(createSession())
        runtimeMocks.readThreadState.mockResolvedValueOnce({
            restored: true,
            state: {
                messages: [],
                pinnedDecisions: [],
                summary: '旧摘要曾提到 https://summary.example.com/not-a-grant',
            },
        })

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        }).run()

        expect(runtimeMocks.createGeneralReActRunContext).toHaveBeenCalledWith(expect.objectContaining({ trustedUserUrls: [] }))
    })

    it('非完整成功的 General ReAct 结果不会写入 Chat Memory', async () => {
        runtimeMocks.createChatSession.mockReturnValue(createSession())
        runtimeMocks.runGeneralReAct.mockResolvedValueOnce({
            assistantText: '阶段超时后的收口回答',
            executedToolCallCount: 0,
            finalizationMode: 'constrained',
            memoryWriteEligible: false,
            modelCallCount: 2,
            modelRetryCount: 0,
            source: 'chat',
            sources: [],
            stopReason: 'action_deadline',
            toolCallCount: 0,
            toolRequestCount: 0,
            toolRetryCount: 0,
        })

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        }).run()

        expect(runtimeMocks.appendCompletedTurn).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('completed terminal 的 durable projection 失败时不写入 Chat Memory 或 UserMemory', async () => {
        const session = createSession()
        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const writeTerminalChunk = vi.fn().mockRejectedValue(new Error('terminal projection failed'))
        runtimeMocks.createChatSession.mockReturnValue(session)

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
            writeTerminalChunk,
        }).run()

        expect(writeTerminalChunk).toHaveBeenCalledWith({ type: 'finish' }, 'completed')
        expect(runtimeMocks.appendCompletedTurn).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
    })

    it('completed terminal 已持久化后，取消会解除挂起的 Memory append，不再等待或继续后置写入', async () => {
        const abortController = new AbortController()
        const appendStarted = Promise.withResolvers<void>()
        const hangingAppend = Promise.withResolvers<void>()
        const executionOrder: string[] = []
        const writeTerminalChunk = vi.fn(async () => {
            executionOrder.push('terminal-completed')
        })
        runtimeMocks.createChatSession.mockReturnValue(createSession())
        runtimeMocks.appendCompletedTurn.mockImplementationOnce(() => {
            executionOrder.push('append-started')
            appendStarted.resolve()
            return hangingAppend.promise
        })

        const runPromise = new ChatOrchestrator({
            context: {
                ...createExecutionContext(),
                signal: abortController.signal,
            },
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
            writeTerminalChunk,
        }).run()

        await appendStarted.promise
        abortController.abort(new DOMException('request cancelled', 'AbortError'))
        await expect(runPromise).resolves.toBeUndefined()

        expect(executionOrder).toEqual(['terminal-completed', 'append-started'])
        expect(writeTerminalChunk).toHaveBeenCalledWith({ type: 'finish' }, 'completed')
        expect(runtimeMocks.touchConversation).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
        expect(generalReActExecutionGate.activeCount()).toBe(0)

        // append 在取消后才失败也必须被 orchestration 消费，不能重新卡住或形成 unhandled rejection。
        hangingAppend.reject(new Error('late memory append failure'))
        await Promise.resolve()
        expect(runtimeMocks.touchConversation).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('第九个普通 chat 在创建 session 前快速失败，释放已占用的 permit 后可继续', async () => {
        const permits = Array.from({ length: 8 }, () => generalReActExecutionGate.tryAcquire()).filter(
            (permit): permit is NonNullable<typeof permit> => permit !== null
        )

        try {
            const writtenChunks: Array<{ type: string; errorCode?: string }> = []
            await new ChatOrchestrator({
                context: createExecutionContext(),
                isClosed: () => false,
                request: createRequest(),
                writeChunk: chunk => writtenChunks.push(chunk),
            }).run()

            expect(writtenChunks).toContainEqual(
                expect.objectContaining({
                    errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                    type: 'error',
                })
            )
            expect(runtimeMocks.createChatSession).not.toHaveBeenCalled()
        } finally {
            for (const permit of permits) permit.release()
        }
    })

    it('completed terminal 后的 chat memory append 不会再写入 stream chunk', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.appendCompletedTurn.mockImplementationOnce(
            async (_threadId, _input, options?: { onStatus?: (event: unknown) => void }) => {
                options?.onStatus?.({
                    status: 'started',
                    message: '自动压缩上下文中',
                })
                options?.onStatus?.({
                    status: 'succeeded',
                    message: '上下文已自动压缩',
                    summaryLength: 120,
                    pinnedDecisionCount: 2,
                })
            }
        )
        const writtenChunks: Array<{
            type: string
            status?: string
            message?: string
            summaryLength?: number
            pinnedDecisionCount?: number
        }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
    })

    it('preflight 已开始压缩后请求取消仍会写出终态 failed status，避免 UI 卡在 loading', async () => {
        const abortController = new AbortController()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.createChatContextPreflight.mockImplementationOnce((options: { onStatus?: (event: unknown) => void }) => ({
            prepare: async () => {
                options.onStatus?.({
                    status: 'started',
                    message: '自动压缩上下文中',
                })
                throw new DOMException('request cancelled', 'AbortError')
            },
        }))
        const writtenChunks: Array<{ type: string; status?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: {
                resolvedModelSelection: createExecutionContext().resolvedModelSelection,
                signal: abortController.signal,
            },
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await expect(orchestrator.run()).rejects.toMatchObject({ name: 'AbortError' })

        expect(writtenChunks.filter(chunk => chunk.type === 'thread-memory-status').map(chunk => chunk.status)).toEqual([
            'started',
            'failed',
        ])
        expect(runtimeMocks.createChatContextPreflight).toHaveBeenCalledWith(expect.objectContaining({ signal: abortController.signal }))
    })

    it('generic chat 的 Composer context 先准备再进入同一个 General ReAct runner', async () => {
        const request = createSummaryDocsRequest()
        const session = createSession({
            activeToolDefinitionMap: new Map([['calculator', calculatorToolDefinition]]),
            activeToolNames: ['calculator'],
            activeTools: [calculatorToolDefinition],
        })
        const preparedMessage = new SystemMessage('prepared docs context')

        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue({ kind: 'docs-summary' })
        runtimeMocks.prepareComposerContextInvocation.mockResolvedValueOnce({
            messages: [preparedMessage],
            nonMessagePayloads: [],
        })
        runtimeMocks.runGeneralReAct.mockResolvedValueOnce({
            assistantText: '基于文档的 Agent 回答',
            executedToolCallCount: 0,
            finalizationMode: 'normal',
            modelCallCount: 1,
            modelRetryCount: 0,
            source: 'chat',
            sources: [],
            stopReason: 'natural_completion',
            toolCallCount: 0,
            toolRequestCount: 0,
            toolRetryCount: 0,
        })

        await new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: vi.fn(),
        }).run()

        expect(runtimeMocks.prepareComposerContextInvocation).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.executeComposerContextInvocation).not.toHaveBeenCalled()
        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: expect.arrayContaining([preparedMessage]),
            })
        )
        expect(session.baseModel.stream).not.toHaveBeenCalled()
    })

    it.each([
        {
            errorCode: 'MODEL_PROVIDER_AUTH_FAILED',
            message: 'API Key 无效或已过期，请检查配置后重试。',
            retryable: false,
        },
        {
            errorCode: 'MODEL_PROVIDER_TIMEOUT',
            message: '模型响应超时，请稍后重试。',
            retryable: true,
        },
    ])('Provider $errorCode 会下发脱敏的 runtime error chunk', async normalizedError => {
        const session = createSession({
            baseModel: {
                stream: vi.fn().mockRejectedValue(new Error('raw provider error')),
            },
            modelHandle: {
                normalizeError: vi.fn().mockReturnValue({
                    code: normalizedError.errorCode,
                    logMeta: {},
                    message: normalizedError.message,
                    retryable: normalizedError.retryable,
                }),
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.runGeneralReAct.mockRejectedValueOnce(new Error('raw provider error'))
        const writtenChunks: Array<{
            type: string
            scope?: string
            errorCode?: string
            message?: string
            retryable?: boolean
        }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'error',
                scope: 'runtime',
                errorCode: normalizedError.errorCode,
                message: normalizedError.message,
                retryable: normalizedError.retryable,
            })
        )
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
        expect(runtimeMocks.appendCompletedTurn).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('Tasklist Graph Runtime / LangSmith observer 不影响普通问答主链路', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).not.toHaveBeenCalled()
        expect(runtimeMocks.startDeliveryChainRun).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledTimes(1)
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('/delivery-chain 命中受控 workflow 后会短路普通链路', async () => {
        const request = createDeliveryChainRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.startDeliveryChainRun.mockResolvedValue(true)
        const writtenChunks: Array<{ type: string; scope?: string }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startDeliveryChainRun).toHaveBeenCalledWith(
            expect.objectContaining({
                context: createExecutionContext(),
                modelHandle: session.modelHandle,
                request,
                writeChunk: expect.any(Function),
            })
        )
        expect(runtimeMocks.startVersionPlanTasklistAgentRun).not.toHaveBeenCalled()
        expect(runtimeMocks.executeComposerContextInvocation).not.toHaveBeenCalled()
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(runtimeMocks.readThreadState).not.toHaveBeenCalled()
        expect(runtimeMocks.appendCompletedTurn).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Tasklist Graph Runtime 不影响 /summary @demo 普通 Composer Context 链路', async () => {
        const request = createSummaryDocsRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue({
            kind: 'docs-summary',
        })
        const writtenChunks: Array<{ type: string; scope?: string }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).not.toHaveBeenCalled()
        expect(runtimeMocks.prepareComposerContextInvocation).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.executeComposerContextInvocation).not.toHaveBeenCalled()
        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledTimes(1)
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Tasklist Graph Runtime 不让 /check 误入 tasklist Agent', async () => {
        const request = createCheckRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).not.toHaveBeenCalled()
        expect(runtimeMocks.runGeneralReAct).toHaveBeenCalledTimes(1)
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('/tasklist 默认使用 Graph Runtime 并短路普通链路', async () => {
        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).toHaveBeenCalledWith(
            expect.objectContaining({
                assistantMessageId: expect.any(String),
                context: createExecutionContext(),
                conversationId: request.conversationId,
                modelId: 'ollama/qwen3-8b',
                models: expect.objectContaining({
                    drafting: expect.objectContaining({
                        model: expect.any(Object),
                        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.stepTimeoutMs,
                    }),
                    planning: expect.objectContaining({
                        model: expect.any(Object),
                        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.stepTimeoutMs,
                    }),
                }),
                reasoningEnabled: true,
                runId: expect.any(String),
                runtimeConfig: expect.objectContaining({
                    graphCheckpointMode: 'memory',
                    graphDebugViewEnabled: false,
                    graphEventsEnabled: false,
                }),
                sessionId: 'test-session',
                userGoal: '基于这个版本方案生成 tasklist 草稿',
                writeChunk: expect.any(Function),
            })
        )
        expect(runtimeMocks.startDeliveryChainRun).not.toHaveBeenCalled()
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(runtimeMocks.readThreadState).not.toHaveBeenCalled()
        expect(runtimeMocks.appendCompletedTurn).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('历史 runtime env 存在时仍进入 Graph Runtime', async () => {
        vi.stubEnv('AI_MIND_TASKLIST_AGENT_RUNTIME', 'legacy')

        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).toHaveBeenCalledWith(
            expect.objectContaining({
                assistantMessageId: expect.any(String),
                context: createExecutionContext(),
                conversationId: request.conversationId,
                modelId: 'ollama/qwen3-8b',
                models: expect.objectContaining({
                    drafting: expect.objectContaining({
                        model: expect.any(Object),
                        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.drafting.stepTimeoutMs,
                    }),
                    planning: expect.objectContaining({
                        model: expect.any(Object),
                        timeoutMs: TASKLIST_AGENT_MODEL_POLICIES.planning.stepTimeoutMs,
                    }),
                }),
                reasoningEnabled: true,
                runId: expect.any(String),
                runtimeConfig: expect.objectContaining({
                    graphCheckpointMode: 'memory',
                    graphDebugViewEnabled: false,
                    graphEventsEnabled: false,
                }),
                sessionId: 'test-session',
                userGoal: '基于这个版本方案生成 tasklist 草稿',
                writeChunk: expect.any(Function),
            })
        )
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Graph Runtime 失败时直接返回 runtime error', async () => {
        runtimeMocks.startVersionPlanTasklistAgentRun.mockRejectedValueOnce(new Error('graph failed'))

        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.startVersionPlanTasklistAgentRun).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Tasklist AgentRun 数据层未就绪时不误报为模型响应失败', async () => {
        runtimeMocks.startVersionPlanTasklistAgentRun.mockRejectedValueOnce(
            new Error('DATABASE_URL is required to use the Prisma data layer.')
        )

        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{
            type: string
            scope?: string
            errorCode?: string
            message?: string
            retryable?: boolean
        }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'error',
                scope: 'runtime',
                errorCode: 'RUNTIME_INVARIANT_FAILED',
                message: expect.stringContaining('数据服务未配置'),
                retryable: false,
            })
        )
        expect(writtenChunks).not.toContainEqual(
            expect.objectContaining({
                errorCode: 'MODEL_STREAM_FAILED',
            })
        )
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('context preflight 的输入超限仍返回 MODEL_PROVIDER_INVALID_REQUEST 而不是 MODEL_STREAM_FAILED', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.prepareChatContext.mockRejectedValueOnce(new InputLengthExceededError(20_480, 20_481))
        const writtenChunks: Array<{
            type: string
            scope?: string
            errorCode?: string
            message?: string
            retryable?: boolean
        }> = []

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'error',
                scope: 'runtime',
                errorCode: 'MODEL_PROVIDER_INVALID_REQUEST',
                retryable: false,
            })
        )
        expect(writtenChunks).not.toContainEqual(
            expect.objectContaining({
                errorCode: 'MODEL_STREAM_FAILED',
            })
        )
    })

    it('Tasklist Agent 缺少 session secret 时不误报为模型响应失败', async () => {
        runtimeMocks.startVersionPlanTasklistAgentRun.mockRejectedValueOnce(
            new Error('AI_MIND_AGENT_RUN_SESSION_SECRET must contain at least 32 characters.')
        )

        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{
            type: string
            scope?: string
            errorCode?: string
            message?: string
            retryable?: boolean
        }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'error',
                scope: 'runtime',
                errorCode: 'RUNTIME_INVARIANT_FAILED',
                message: expect.stringContaining('AI_MIND_AGENT_RUN_SESSION_SECRET'),
                retryable: false,
            })
        )
        expect(writtenChunks).not.toContainEqual(
            expect.objectContaining({
                errorCode: 'MODEL_STREAM_FAILED',
            })
        )
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Tasklist Agent durable checkpoint 未初始化时不误报为模型响应失败', async () => {
        runtimeMocks.startVersionPlanTasklistAgentRun.mockRejectedValueOnce(
            new Error('relation "langgraph_checkpoint.checkpoints" does not exist')
        )

        const request = createTasklistRequest()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{
            type: string
            scope?: string
            errorCode?: string
            message?: string
            retryable?: boolean
        }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'error',
                scope: 'runtime',
                errorCode: 'RUNTIME_INVARIANT_FAILED',
                message: expect.stringContaining('db:checkpoint:setup'),
                retryable: false,
            })
        )
        expect(writtenChunks).not.toContainEqual(
            expect.objectContaining({
                errorCode: 'MODEL_STREAM_FAILED',
            })
        )
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('abort 路径不会写出 finish，且终态事件不会重复', async () => {
        const abortController = new AbortController()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.runGeneralReAct.mockImplementationOnce(async () => {
            abortController.abort()
            throw new DOMException('request cancelled', 'AbortError')
        })

        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: {
                resolvedModelSelection: createExecutionContext().resolvedModelSelection,
                signal: abortController.signal,
            },
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await expect(orchestrator.run()).rejects.toMatchObject({ name: 'AbortError' })

        expect(collectChunkTypes(writtenChunks)).toEqual(['start'])
        expectSingleTerminalChunk(writtenChunks)
    })
})
