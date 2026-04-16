import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeMocks = vi.hoisted(() => {
    return {
        buildSystemMessages: vi.fn(),
        createChatSession: vi.fn(),
        decideAuthoritativeToolAnswer: vi.fn(),
        executeToolCall: vi.fn(),
        formatToolInput: vi.fn(),
        hasVisibleAssistantText: vi.fn(),
        normalizeAndValidateToolCalls: vi.fn(),
        shouldBypassAuthoritativeAnswer: vi.fn(),
        streamAssistantParts: vi.fn(),
        streamPlanningResponse: vi.fn(),
        stripMessageText: vi.fn(),
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
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)
        runtimeMocks.stripMessageText.mockImplementation((message: AIMessage) => message)
        runtimeMocks.writeToolValidationErrors.mockReturnValue([])
        runtimeMocks.formatToolInput.mockReturnValue('1+1')
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(false)
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(true)
        runtimeMocks.decideAuthoritativeToolAnswer.mockReturnValue({
            shouldBypassModel: false,
            toolNames: [],
        })
    })

    it('direct-answer 路径只会收口一次 finish', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        const writtenChunks: Array<{ type: string; scope?: string }> = []

        const orchestrator = new ChatOrchestrator({
            context: {},
            deps: { defaultModel: 'qwen3:8b' },
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

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
            context: {},
            deps: { defaultModel: 'qwen3:8b' },
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
            context: {},
            deps: { defaultModel: 'qwen3:8b' },
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
            context: {},
            deps: { defaultModel: 'qwen3:8b' },
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
            context: {},
            deps: { defaultModel: 'qwen3:8b' },
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
                signal: abortController.signal,
            },
            deps: { defaultModel: 'qwen3:8b' },
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()

        expect(collectChunkTypes(writtenChunks)).toEqual(['start'])
        expectSingleTerminalChunk(writtenChunks)
    })
})
