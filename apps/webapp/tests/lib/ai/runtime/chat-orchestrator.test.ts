import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

const runtimeMocks = vi.hoisted(() => {
    return {
        buildSystemMessages: vi.fn(),
        createChatSession: vi.fn(),
        decideAuthoritativeToolAnswer: vi.fn(),
        executeComposerContextInvocation: vi.fn(),
        executeToolCall: vi.fn(),
        formatToolInput: vi.fn(),
        hasVisibleAssistantText: vi.fn(),
        normalizeAndValidateToolCalls: vi.fn(),
        resolveComposerContextInvocation: vi.fn(),
        shouldBypassAuthoritativeAnswer: vi.fn(),
        streamAssistantParts: vi.fn(),
        streamPlanningResponse: vi.fn(),
        stripMessageText: vi.fn(),
        runVersionPlanTasklistGraph: vi.fn(),
        writeStaticTextPart: vi.fn(),
        writeToolValidationErrors: vi.fn(),
    }
})

vi.mock('@/lib/ai/runtime/assistant-stream', () => ({
    hasVisibleAssistantText: runtimeMocks.hasVisibleAssistantText,
    streamAssistantParts: runtimeMocks.streamAssistantParts,
    streamPlanningResponse: runtimeMocks.streamPlanningResponse,
    stripMessageText: runtimeMocks.stripMessageText,
}))

vi.mock('@/lib/ai/runtime/authoritative-answer', () => ({
    decideAuthoritativeToolAnswer: runtimeMocks.decideAuthoritativeToolAnswer,
    shouldBypassAuthoritativeAnswer: runtimeMocks.shouldBypassAuthoritativeAnswer,
}))

vi.mock('@/lib/ai/runtime/chat-session', () => ({
    buildSystemMessages: runtimeMocks.buildSystemMessages,
    createChatSession: runtimeMocks.createChatSession,
}))

vi.mock('@/lib/ai/runtime/composer-context', () => ({
    executeComposerContextInvocation: runtimeMocks.executeComposerContextInvocation,
    resolveComposerContextInvocation: runtimeMocks.resolveComposerContextInvocation,
}))

vi.mock('@ai-mind/stream-core', async importOriginal => {
    const actual = await importOriginal<typeof import('@ai-mind/stream-core')>()

    return {
        ...actual,
        writeStaticTextPart: runtimeMocks.writeStaticTextPart,
    }
})

vi.mock('@/lib/ai/runtime/tool-runtime', () => ({
    executeToolCall: runtimeMocks.executeToolCall,
    formatToolInput: runtimeMocks.formatToolInput,
    normalizeAndValidateToolCalls: runtimeMocks.normalizeAndValidateToolCalls,
    writeToolValidationErrors: runtimeMocks.writeToolValidationErrors,
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent/graph/run-version-plan-tasklist-graph', () => ({
    runVersionPlanTasklistGraph: runtimeMocks.runVersionPlanTasklistGraph,
}))

import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'

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
                    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
                    label: 'v0.2.0-controlled-agent-graph.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
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
                    id: 'docs://README.md',
                    label: 'README.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'docs://README.md',
                },
            ],
        },
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
                    id: 'docs://versions/v0.2.0-controlled-agent-graph.md',
                    label: 'v0.2.0-controlled-agent-graph.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'docs://versions/v0.2.0-controlled-agent-graph.md',
                },
            ],
        },
    }
}

function createSession(overrides: Record<string, unknown> = {}) {
    const baseModelStream = vi.fn().mockResolvedValue({ name: 'base-stream' })

    return {
        request: createRequest(),
        baseModel: {
            stream: baseModelStream,
        },
        toolBoundModel: null,
        skillDefinition: undefined,
        skillSystemPrompt: undefined,
        skillOutputPolicyPrompt: undefined,
        activeTools: [],
        activeToolNames: [],
        langChainMessages: [],
        directAnswerMessages: [],
        toolUseSystemPrompt: undefined,
        toolRetrySystemPrompt: undefined,
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
                enabled: true,
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
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue(null)
        runtimeMocks.executeComposerContextInvocation.mockResolvedValue([])
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)
        runtimeMocks.stripMessageText.mockImplementation((message: AIMessage) => message)
        runtimeMocks.writeToolValidationErrors.mockReturnValue([])
        runtimeMocks.formatToolInput.mockReturnValue('1+1')
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(false)
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(true)
        runtimeMocks.runVersionPlanTasklistGraph.mockResolvedValue({
            graphState: {},
            state: {},
        })
        runtimeMocks.decideAuthoritativeToolAnswer.mockReturnValue({
            shouldBypassModel: false,
            toolNames: [],
        })
        vi.unstubAllEnvs()
    })

    it('direct-answer 路径只会收口一次 finish', async () => {
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
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
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
    })

    it('Tasklist Graph Runtime 不影响普通问答主链路', async () => {
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

        expect(runtimeMocks.runVersionPlanTasklistGraph).not.toHaveBeenCalled()
        expect(session.baseModel.stream).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Tasklist Graph Runtime 不影响 /summary @docs 普通 Composer Context 链路', async () => {
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

        expect(runtimeMocks.runVersionPlanTasklistGraph).not.toHaveBeenCalled()
        expect(runtimeMocks.executeComposerContextInvocation).toHaveBeenCalledTimes(1)
        expect(session.baseModel.stream).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
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

        expect(runtimeMocks.runVersionPlanTasklistGraph).not.toHaveBeenCalled()
        expect(session.baseModel.stream).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('planning + retry 后仍为空时会回退 direct-answer 并只收口一次 finish', async () => {
        const toolBoundModelStream = vi.fn().mockResolvedValueOnce({ name: 'planning-1' }).mockResolvedValueOnce({ name: 'planning-2' })
        const session = createSession({
            toolBoundModel: {
                stream: toolBoundModelStream,
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)

        const firstResponse = new AIMessage({ content: '', tool_calls: [] })
        const retryResponse = new AIMessage({ content: '', tool_calls: [] })
        runtimeMocks.streamPlanningResponse.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(retryResponse)
        runtimeMocks.normalizeAndValidateToolCalls
            .mockReturnValueOnce({
                planningMessage: firstResponse,
                toolCalls: [],
                toolErrors: [],
            })
            .mockReturnValueOnce({
                planningMessage: retryResponse,
                toolCalls: [],
                toolErrors: [],
            })
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)

        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(toolBoundModelStream).toHaveBeenCalledTimes(2)
        expect(session.baseModel.stream).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('validation-only 路径会写出校验错误并只收口一次 finish', async () => {
        const toolBoundModelStream = vi.fn().mockResolvedValue({ name: 'planning' })
        const session = createSession({
            toolBoundModel: {
                stream: toolBoundModelStream,
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)

        const response = new AIMessage({ content: 'planning text', tool_calls: [] })
        runtimeMocks.streamPlanningResponse.mockResolvedValue(response)
        runtimeMocks.normalizeAndValidateToolCalls.mockReturnValue({
            planningMessage: response,
            toolCalls: [],
            toolErrors: [
                {
                    id: 'tool-error-1',
                    toolName: 'calculator',
                    input: '1+1',
                    message: '工具参数不合法',
                    outputPartType: 'tool',
                    source: 'internal',
                },
            ],
        })
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(true)
        runtimeMocks.writeToolValidationErrors.mockReturnValue([
            new ToolMessage({
                content: '工具参数不合法',
                tool_call_id: 'tool-error-1',
                status: 'error',
            }),
        ])

        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.writeToolValidationErrors).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                stage: 'planning',
            })
        )
        expect(runtimeMocks.executeToolCall).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('tool-execution + final-answer 路径只收口一次 finish', async () => {
        const toolCall = {
            id: 'tool-call-1',
            name: 'calculator',
            args: { expression: '1+1' },
            type: 'tool_call' as const,
        }
        const toolBoundModelStream = vi.fn().mockResolvedValueOnce({ name: 'planning' }).mockResolvedValueOnce({ name: 'final' })
        const session = createSession({
            toolBoundModel: {
                stream: toolBoundModelStream,
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)

        const response = new AIMessage({
            content: '',
            tool_calls: [toolCall],
        })
        runtimeMocks.streamPlanningResponse.mockResolvedValue(response)
        runtimeMocks.normalizeAndValidateToolCalls.mockReturnValue({
            planningMessage: response,
            toolCalls: [toolCall],
            toolErrors: [],
        })
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)
        runtimeMocks.executeToolCall.mockResolvedValue({
            toolCall,
            toolMessage: new ToolMessage({
                content: '2',
                tool_call_id: 'tool-call-1',
                status: 'success',
            }),
            output: '2',
            success: true,
        })

        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.executeToolCall).toHaveBeenCalledWith(
            toolCall,
            expect.any(Object),
            expect.any(Function),
            expect.objectContaining({
                errorStage: 'tool-execution',
            })
        )
        expect(toolBoundModelStream).toHaveBeenCalledTimes(1)
        expect(session.baseModel.stream).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.streamAssistantParts).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('authoritative 路径会绕过 final-answer 并只收口一次 finish', async () => {
        const toolCall = {
            id: 'tool-call-1',
            name: 'calculator',
            args: { expression: '1+1' },
            type: 'tool_call' as const,
        }
        const request = {
            ...createRequest(),
            messages: [
                {
                    role: 'user' as const,
                    parts: [
                        {
                            type: 'text' as const,
                            format: 'markdown' as const,
                            text: '1+1=？',
                        },
                    ],
                },
            ],
        }
        const toolBoundModelStream = vi.fn().mockResolvedValueOnce({ name: 'planning' })
        const session = createSession({
            toolBoundModel: {
                stream: toolBoundModelStream,
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)

        const response = new AIMessage({
            content: '',
            tool_calls: [toolCall],
        })
        runtimeMocks.streamPlanningResponse.mockResolvedValue(response)
        runtimeMocks.normalizeAndValidateToolCalls.mockReturnValue({
            planningMessage: response,
            toolCalls: [toolCall],
            toolErrors: [],
        })
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)
        runtimeMocks.executeToolCall.mockResolvedValue({
            toolCall,
            toolMessage: new ToolMessage({
                content: '2',
                tool_call_id: 'tool-call-1',
                status: 'success',
            }),
            output: '2',
            success: true,
        })
        runtimeMocks.decideAuthoritativeToolAnswer.mockReturnValue({
            shouldBypassModel: true,
            answerText: '`1+1` 的结果是 **2**。',
            reason: 'single-authoritative-tool',
            toolNames: ['calculator'],
        })

        const writtenChunks: Array<{ type: string; scope?: string }> = []
        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request,
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(runtimeMocks.writeStaticTextPart).toHaveBeenCalledTimes(1)
        expect(toolBoundModelStream).toHaveBeenCalledTimes(1)
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

        expect(runtimeMocks.runVersionPlanTasklistGraph).toHaveBeenCalledWith(
            expect.objectContaining({
                context: createExecutionContext(),
                conversationId: request.conversationId,
                model: session.baseModel,
                runtimeConfig: expect.objectContaining({
                    graphCheckpointMode: 'off',
                    graphDebugViewEnabled: false,
                    graphEventsEnabled: false,
                }),
                userGoal: '基于这个版本方案生成 tasklist 草稿',
                writeChunk: expect.any(Function),
            })
        )
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(runtimeMocks.streamAssistantParts).not.toHaveBeenCalled()
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

        expect(runtimeMocks.runVersionPlanTasklistGraph).toHaveBeenCalledWith(
            expect.objectContaining({
                context: createExecutionContext(),
                conversationId: request.conversationId,
                model: session.baseModel,
                runtimeConfig: expect.objectContaining({
                    graphCheckpointMode: 'off',
                    graphDebugViewEnabled: false,
                    graphEventsEnabled: false,
                }),
                userGoal: '基于这个版本方案生成 tasklist 草稿',
                writeChunk: expect.any(Function),
            })
        )
        expect(session.baseModel.stream).not.toHaveBeenCalled()
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('Graph Runtime 失败时直接返回 runtime error', async () => {
        runtimeMocks.runVersionPlanTasklistGraph.mockRejectedValueOnce(new Error('graph failed'))

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

        expect(runtimeMocks.runVersionPlanTasklistGraph).toHaveBeenCalledTimes(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'error:runtime'])
        expectSingleTerminalChunk(writtenChunks)
    })

    it('abort 路径不会写出 finish，且终态事件不会重复', async () => {
        const abortController = new AbortController()
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockImplementation(async () => {
            abortController.abort()
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

        await orchestrator.run()

        expect(collectChunkTypes(writtenChunks)).toEqual(['start'])
        expectSingleTerminalChunk(writtenChunks)
    })
})
