import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'

const runtimeMocks = vi.hoisted(() => ({
    appendCompletedTurn: vi.fn(),
    buildChatMemoryContextMessages: vi.fn(),
    buildSystemMessages: vi.fn(),
    buildUserMemoryContextMessages: vi.fn(),
    createChatSession: vi.fn(),
    decideAuthoritativeToolAnswer: vi.fn(),
    executeCapabilityContextInvocations: vi.fn(),
    executeComposerContextInvocation: vi.fn(),
    executeToolCall: vi.fn(),
    formatToolInput: vi.fn(),
    hasVisibleAssistantText: vi.fn(),
    normalizeAndValidateToolCalls: vi.fn(),
    processCompletedTurnForMemory: vi.fn(),
    readThreadState: vi.fn(),
    resolveCapabilityContextInvocations: vi.fn(),
    resolveComposerContextInvocation: vi.fn(),
    retrieveRelevantMemories: vi.fn(),
    shouldBypassAuthoritativeAnswer: vi.fn(),
    startDeliveryChainRun: vi.fn(),
    startVersionPlanTasklistAgentRun: vi.fn(),
    streamAssistantParts: vi.fn(),
    streamPlanningResponse: vi.fn(),
    stripMessageText: vi.fn(),
    touchConversation: vi.fn(),
    writeStaticTextPart: vi.fn(),
    writeToolValidationErrors: vi.fn(),
}))

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

vi.mock('@/lib/ai/runtime/capability-context', () => ({
    executeCapabilityContextInvocations: runtimeMocks.executeCapabilityContextInvocations,
    resolveCapabilityContextInvocations: runtimeMocks.resolveCapabilityContextInvocations,
}))

vi.mock('@/lib/ai/runtime/chat-session', () => ({
    buildSystemMessages: runtimeMocks.buildSystemMessages,
    createChatSession: runtimeMocks.createChatSession,
    withChatMemoryContextMessages: (
        messages: Array<SystemMessage | HumanMessage>,
        memoryContextMessages: Array<SystemMessage | HumanMessage>
    ) => {
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

vi.mock('@/lib/ai/runtime/composer-context', () => ({
    executeComposerContextInvocation: runtimeMocks.executeComposerContextInvocation,
    resolveComposerContextInvocation: runtimeMocks.resolveComposerContextInvocation,
}))

vi.mock('@/lib/ai/runtime/delivery-chain', () => ({
    startDeliveryChainRun: runtimeMocks.startDeliveryChainRun,
}))

vi.mock('@/lib/ai/runtime/tool-runtime', () => ({
    executeToolCall: runtimeMocks.executeToolCall,
    formatToolInput: runtimeMocks.formatToolInput,
    normalizeAndValidateToolCalls: runtimeMocks.normalizeAndValidateToolCalls,
    writeToolValidationErrors: runtimeMocks.writeToolValidationErrors,
}))

vi.mock('@/lib/ai/runtime/user-memory', () => ({
    buildUserMemoryContextMessages: runtimeMocks.buildUserMemoryContextMessages,
    processCompletedTurnForMemory: runtimeMocks.processCompletedTurnForMemory,
    userMemoryService: {
        retrieveRelevantMemories: runtimeMocks.retrieveRelevantMemories,
    },
}))

vi.mock('@/lib/ai/runtime/version-plan-tasklist-agent', () => ({
    createTasklistAgentModelSet: vi.fn(),
    createVersionPlanTasklistAgentSkeleton: vi.fn(),
    getTasklistAgentRuntimeConfig: vi.fn(),
    resolveVersionPlanTasklistAgentInvocation: vi.fn(() => null),
    startVersionPlanTasklistAgentRun: runtimeMocks.startVersionPlanTasklistAgentRun,
}))

vi.mock('@ai-mind/stream-core', async importOriginal => {
    const actual = await importOriginal<typeof import('@ai-mind/stream-core')>()

    return {
        ...actual,
        writeStaticTextPart: runtimeMocks.writeStaticTextPart,
    }
})

import { ChatOrchestrator } from '@/lib/ai/runtime/chat-orchestrator'

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
        validatedConversationId: 'test-conversation',
    }
}

function createRequest() {
    return {
        conversationId: 'test-conversation',
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        format: 'markdown' as const,
                        text: '给我推荐几种水果。',
                        type: 'text' as const,
                    },
                ],
            },
        ],
        options: {},
    }
}

function createSummaryRequest() {
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

function createTechnicalQuestionRequest() {
    return {
        ...createRequest(),
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        format: 'markdown' as const,
                        text: '解释一下 React useEffect。',
                        type: 'text' as const,
                    },
                ],
            },
        ],
    }
}

function createWorkBackgroundQuestionRequest() {
    return {
        ...createRequest(),
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        format: 'markdown' as const,
                        text: '你知道我的工作吗？',
                        type: 'text' as const,
                    },
                ],
            },
        ],
    }
}

function createReaderSkillCapabilityRequest() {
    return {
        ...createRequest(),
        messages: [
            {
                role: 'user' as const,
                parts: [
                    {
                        format: 'markdown' as const,
                        text: '结合当前项目上下文，用大白话解释一下这个方案。',
                        type: 'text' as const,
                    },
                ],
            },
        ],
        options: {
            skill: 'reader-skill',
        },
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
                    id: 'demo://version-plans/demo.md',
                    label: 'demo.md',
                    source: 'local' as const,
                    type: 'resource' as const,
                    uri: 'demo://version-plans/demo.md',
                },
            ],
        },
    }
}

function createDeliveryRequest() {
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
                        format: 'markdown' as const,
                        text: '帮我规划一个登录表单，支持手机号和错误提示',
                        type: 'text' as const,
                    },
                ],
            },
        ],
    }
}

function createSession(overrides: Record<string, unknown> = {}) {
    const baseModelStream = vi.fn().mockResolvedValue({ name: 'base-stream' })

    return {
        activeToolCapabilityIds: {},
        activeToolDefinitionMap: new Map(),
        activeToolNames: [],
        activeTools: [],
        baseModel: {
            stream: baseModelStream,
        },
        directAnswerMessages: [],
        langChainMessages: [],
        modelHandle: {
            normalizeError: vi.fn().mockReturnValue({
                code: 'MODEL_STREAM_FAILED',
                logMeta: {},
                message: 'Model streaming failed.',
                retryable: true,
            }),
        },
        request: createRequest(),
        toolBoundModel: null,
        ...overrides,
    }
}

function collectChunkTypes(chunks: Array<{ type: string }>) {
    return chunks.map(chunk => chunk.type)
}

describe('runtime/chat-orchestrator user-memory integration', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        runtimeMocks.appendCompletedTurn.mockResolvedValue(undefined)
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([])
        runtimeMocks.buildSystemMessages.mockReturnValue([])
        runtimeMocks.buildUserMemoryContextMessages.mockReturnValue([])
        runtimeMocks.executeCapabilityContextInvocations.mockResolvedValue([])
        runtimeMocks.executeComposerContextInvocation.mockResolvedValue([])
        runtimeMocks.formatToolInput.mockReturnValue('1+1')
        runtimeMocks.hasVisibleAssistantText.mockReturnValue(false)
        runtimeMocks.normalizeAndValidateToolCalls.mockReturnValue({
            planningMessage: new AIMessage({ content: '', tool_calls: [] }),
            toolCalls: [],
            toolErrors: [],
        })
        runtimeMocks.processCompletedTurnForMemory.mockResolvedValue({
            candidates: 0,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 0,
        })
        runtimeMocks.readThreadState.mockResolvedValue({
            restored: false,
            state: {
                messages: [],
                pinnedDecisions: ['尽量中文'],
                summary: '旧摘要',
            },
        })
        runtimeMocks.resolveCapabilityContextInvocations.mockReturnValue([])
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue(null)
        runtimeMocks.retrieveRelevantMemories.mockResolvedValue([])
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(false)
        runtimeMocks.startDeliveryChainRun.mockResolvedValue(false)
        runtimeMocks.startVersionPlanTasklistAgentRun.mockResolvedValue(undefined)
        runtimeMocks.streamAssistantParts.mockResolvedValue('好的，推荐桃子。')
        runtimeMocks.streamPlanningResponse.mockResolvedValue(new AIMessage({ content: '', tool_calls: [] }))
        runtimeMocks.stripMessageText.mockImplementation((message: AIMessage) => message)
        runtimeMocks.touchConversation.mockResolvedValue(undefined)
        runtimeMocks.writeToolValidationErrors.mockReturnValue([])
    })

    it('ordinary chat 会先注入 UserMemory，再注入 short-term memory，并在 final turn 后异步启动 extraction', async () => {
        const userMemoryMessage = new SystemMessage('user memory')
        const chatMemoryMessage = new SystemMessage('chat memory')
        const session = createSession({
            directAnswerMessages: [new SystemMessage('base system'), new HumanMessage('current user')],
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.retrieveRelevantMemories.mockResolvedValue([
            {
                score: 4,
                stableKey: 'user_preference:prefer-桃子',
                tags: ['桃子'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
        ])
        runtimeMocks.buildUserMemoryContextMessages.mockReturnValue([userMemoryMessage])
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([chatMemoryMessage])

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).toHaveBeenCalledWith({
            latestUserText: '给我推荐几种水果。',
            path: 'ordinary_chat',
            sessionId: 'test-session',
        })
        expect(session.baseModel.stream).toHaveBeenCalledWith(
            [new SystemMessage('base system'), userMemoryMessage, chatMemoryMessage, new HumanMessage('current user')],
            expect.objectContaining({
                signal: undefined,
            })
        )
        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith({
            assistantFinalText: '好的，推荐桃子。',
            latestUserText: '给我推荐几种水果。',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['尽量中文'],
                summary: '旧摘要',
            },
            sessionId: 'test-session',
            sourceConversationId: 'test-conversation',
        })
    })

    it('tool-assisted ordinary chat 的 authoritative answer 也会触发 tool_assisted extraction', async () => {
        const toolCall = {
            args: { expression: '1+1' },
            id: 'tool-call-1',
            name: 'calculator',
            type: 'tool_call' as const,
        }
        const session = createSession({
            toolBoundModel: {
                stream: vi.fn().mockResolvedValue({ name: 'planning' }),
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamPlanningResponse.mockResolvedValue(
            new AIMessage({
                content: '',
                tool_calls: [toolCall],
            })
        )
        runtimeMocks.normalizeAndValidateToolCalls.mockReturnValue({
            planningMessage: new AIMessage({
                content: '',
                tool_calls: [toolCall],
            }),
            toolCalls: [toolCall],
            toolErrors: [],
        })
        runtimeMocks.executeToolCall.mockResolvedValue({
            output: '2',
            success: true,
            toolCall,
            toolMessage: new ToolMessage({
                content: '2',
                status: 'success',
                tool_call_id: 'tool-call-1',
            }),
        })
        runtimeMocks.shouldBypassAuthoritativeAnswer.mockReturnValue(true)
        runtimeMocks.decideAuthoritativeToolAnswer.mockReturnValue({
            answerText: '`1+1` 的结果是 **2**。',
            reason: 'single-authoritative-tool',
            shouldBypassModel: true,
            toolNames: ['calculator'],
        })

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: {
                ...createRequest(),
                messages: [
                    {
                        role: 'user' as const,
                        parts: [
                            {
                                format: 'markdown' as const,
                                text: '1+1=？',
                                type: 'text' as const,
                            },
                        ],
                    },
                ],
            },
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                assistantFinalText: '`1+1` 的结果是 **2**。',
                latestUserText: '1+1=？',
                path: 'tool_assisted_ordinary_chat',
            })
        )
    })

    it('composer command 不读取也不写入 UserMemory', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.resolveComposerContextInvocation.mockReturnValue({
            execute: runtimeMocks.executeComposerContextInvocation,
            input: {},
            location: 'local',
            promptName: 'summary',
            serverId: undefined,
            source: 'composer',
        })
        runtimeMocks.streamAssistantParts.mockResolvedValue('summary answer')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createSummaryRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('ordinary technical question 不注入无关的 UserMemory', async () => {
        const chatMemoryMessage = new SystemMessage('chat memory')
        const session = createSession({
            directAnswerMessages: [new SystemMessage('base system'), new HumanMessage('解释一下 React useEffect。')],
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([chatMemoryMessage])
        runtimeMocks.streamAssistantParts.mockResolvedValue('useEffect 用来处理副作用。')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createTechnicalQuestionRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).toHaveBeenCalledWith({
            latestUserText: '解释一下 React useEffect。',
            path: 'ordinary_chat',
            sessionId: 'test-session',
        })
        expect(runtimeMocks.buildUserMemoryContextMessages).toHaveBeenCalledWith([])
        expect(session.baseModel.stream).toHaveBeenCalledWith(
            [new SystemMessage('base system'), chatMemoryMessage, new HumanMessage('解释一下 React useEffect。')],
            expect.objectContaining({
                signal: undefined,
            })
        )
    })

    it('用户询问工作背景时会把 stable_user_context 注入 ordinary chat 上下文', async () => {
        const userMemoryMessage = new SystemMessage('work background memory')
        const chatMemoryMessage = new SystemMessage('chat memory')
        const session = createSession({
            directAnswerMessages: [new SystemMessage('base system'), new HumanMessage('你知道我的工作吗？')],
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.retrieveRelevantMemories.mockResolvedValue([
            {
                score: 3,
                stableKey: 'stable_user_context:前端工程师-五年经验-vue-react',
                tags: ['工作', '前端工程师', '五年经验', '技术栈', 'vue', 'react'],
                text: '用户是一名有五年工作经验的前端工程师，主要使用 Vue 和 React。',
                type: 'stable_user_context',
            },
        ])
        runtimeMocks.buildUserMemoryContextMessages.mockReturnValue([userMemoryMessage])
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([chatMemoryMessage])
        runtimeMocks.streamAssistantParts.mockResolvedValue('你是一名前端工程师，主要使用 Vue 和 React。')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createWorkBackgroundQuestionRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).toHaveBeenCalledWith({
            latestUserText: '你知道我的工作吗？',
            path: 'ordinary_chat',
            sessionId: 'test-session',
        })
        expect(runtimeMocks.buildUserMemoryContextMessages).toHaveBeenCalledWith([
            expect.objectContaining({
                stableKey: 'stable_user_context:前端工程师-五年经验-vue-react',
                type: 'stable_user_context',
            }),
        ])
        expect(session.baseModel.stream).toHaveBeenCalledWith(
            [new SystemMessage('base system'), userMemoryMessage, chatMemoryMessage, new HumanMessage('你知道我的工作吗？')],
            expect.objectContaining({
                signal: undefined,
            })
        )
    })

    it('reader-skill capability-context final answer stage 仍可读取 UserMemory，但不会把它传进 raw capability 调用', async () => {
        const userMemoryMessage = new SystemMessage('user memory')
        const chatMemoryMessage = new SystemMessage('chat memory')
        const capabilityContextMessage = new HumanMessage('remote capability context')
        const capabilityInvocations = [
            {
                capabilityType: 'resource',
                input: 'project://latest-context',
                name: 'latest-context',
                serverId: 'project-assistant-service',
            },
        ]
        const session = createSession({
            langChainMessages: [new HumanMessage('结合当前项目上下文，用大白话解释一下这个方案。')],
            skillDefinition: {
                description: 'reader skill',
                name: 'Reader Skill',
                skillId: 'reader-skill',
            },
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.retrieveRelevantMemories.mockResolvedValue([
            {
                score: 0.88,
                stableKey: 'communication_preference:plain-first',
                tags: ['大白话', '技术解释'],
                text: '用户喜欢先用大白话解释技术问题，再补充专业说明。',
                type: 'communication_preference',
            },
        ])
        runtimeMocks.buildUserMemoryContextMessages.mockReturnValue([userMemoryMessage])
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([chatMemoryMessage])
        runtimeMocks.resolveCapabilityContextInvocations.mockReturnValue(capabilityInvocations)
        runtimeMocks.executeCapabilityContextInvocations.mockResolvedValue([capabilityContextMessage])
        runtimeMocks.streamAssistantParts.mockResolvedValue('这是结合项目上下文后的回答。')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createReaderSkillCapabilityRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).toHaveBeenCalledWith({
            latestUserText: '结合当前项目上下文，用大白话解释一下这个方案。',
            path: 'ordinary_chat',
            sessionId: 'test-session',
        })
        expect(runtimeMocks.buildUserMemoryContextMessages).toHaveBeenCalledWith([
            expect.objectContaining({
                stableKey: 'communication_preference:plain-first',
                type: 'communication_preference',
            }),
        ])
        expect(runtimeMocks.resolveCapabilityContextInvocations).toHaveBeenCalledWith(
            createReaderSkillCapabilityRequest(),
            expect.objectContaining({
                skillId: 'reader-skill',
            })
        )
        expect(runtimeMocks.executeCapabilityContextInvocations).toHaveBeenCalledWith(
            capabilityInvocations,
            expect.objectContaining({
                context: expect.objectContaining({
                    sessionId: 'test-session',
                    validatedConversationId: 'test-conversation',
                }),
                writeChunk: expect.any(Function),
            })
        )
        expect(session.baseModel.stream).toHaveBeenCalledWith(
            [chatMemoryMessage, new HumanMessage('结合当前项目上下文，用大白话解释一下这个方案。'), capabilityContextMessage],
            expect.objectContaining({
                signal: undefined,
            })
        )
    })

    it('UserMemory extraction failure 不影响已完成回答和 final-turn memory 收口', async () => {
        const session = createSession()
        const writtenChunks: Array<{ type: string }> = []
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockResolvedValue('正常回答。')
        runtimeMocks.processCompletedTurnForMemory.mockRejectedValueOnce(new Error('store unavailable'))

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.appendCompletedTurn).toHaveBeenCalledWith(
            'chat-conversation:test-session:test-conversation',
            expect.objectContaining({
                assistantText: '正常回答。',
                source: 'chat',
                userText: '给我推荐几种水果。',
            }),
            expect.objectContaining({
                onStatus: expect.any(Function),
            })
        )
        expect(runtimeMocks.touchConversation).toHaveBeenCalledWith('test-session', 'test-conversation', {
            hasMessages: true,
        })
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
    })

    it('chat-memory append 失败时，仍会 touch conversation 并继续后台 UserMemory extraction', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockResolvedValue('正常回答。')
        runtimeMocks.appendCompletedTurn.mockRejectedValueOnce(new Error('append failed'))

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.touchConversation).toHaveBeenCalledWith('test-session', 'test-conversation', {
            hasMessages: true,
        })
        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                assistantFinalText: '正常回答。',
                latestUserText: '给我推荐几种水果。',
                path: 'ordinary_chat',
            })
        )
    })

    it('conversation touch 失败时，仍会继续后台 UserMemory extraction', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockResolvedValue('正常回答。')
        runtimeMocks.touchConversation.mockRejectedValueOnce(new Error('touch failed'))

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.appendCompletedTurn).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                assistantFinalText: '正常回答。',
                latestUserText: '给我推荐几种水果。',
                path: 'ordinary_chat',
            })
        )
    })

    it('post-turn UserMemory extraction 不会 mutate ThreadState，也不会暴露公开 payload', async () => {
        const writtenChunks: Array<{ type: string }> = []
        const frozenThreadState = Object.freeze({
            restored: false,
            state: Object.freeze({
                messages: Object.freeze([
                    Object.freeze({
                        content: '上一轮消息',
                        role: 'assistant',
                    }),
                ]),
                pinnedDecisions: Object.freeze(['尽量中文']),
                summary: '旧摘要',
            }),
        })
        const session = createSession()

        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.readThreadState.mockResolvedValue(frozenThreadState)
        runtimeMocks.streamAssistantParts.mockResolvedValue('保持当前回答。')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => writtenChunks.push(chunk),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.processCompletedTurnForMemory).toHaveBeenCalledWith({
            assistantFinalText: '保持当前回答。',
            latestUserText: '给我推荐几种水果。',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['尽量中文'],
                summary: '旧摘要',
            },
            sessionId: 'test-session',
            sourceConversationId: 'test-conversation',
        })
        expect(frozenThreadState.state.summary).toBe('旧摘要')
        expect(frozenThreadState.state.pinnedDecisions).toEqual(['尽量中文'])
        expect(frozenThreadState.state.messages).toHaveLength(1)
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
        expect(JSON.stringify(writtenChunks)).not.toContain('userMemory')
        expect(JSON.stringify(writtenChunks)).not.toContain('selectedUserMemories')
        expect(JSON.stringify(writtenChunks)).not.toContain('stableKey')
    })

    it('suppressed memory 后的相关问题不再注入旧偏好', async () => {
        const chatMemoryMessage = new SystemMessage('chat memory')
        const session = createSession({
            directAnswerMessages: [new SystemMessage('base system'), new HumanMessage('给我推荐几种水果。')],
        })
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.buildChatMemoryContextMessages.mockReturnValue([chatMemoryMessage])
        runtimeMocks.streamAssistantParts.mockResolvedValue('可以考虑苹果、梨和葡萄。')

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.retrieveRelevantMemories).toHaveBeenCalledWith({
            latestUserText: '给我推荐几种水果。',
            path: 'ordinary_chat',
            sessionId: 'test-session',
        })
        expect(runtimeMocks.buildUserMemoryContextMessages).toHaveBeenCalledWith([])
        expect(session.baseModel.stream).toHaveBeenCalledWith(
            [new SystemMessage('base system'), chatMemoryMessage, new HumanMessage('给我推荐几种水果。')],
            expect.objectContaining({
                signal: undefined,
            })
        )
    })

    it('Tasklist 路径不读取也不写入 UserMemory', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createTasklistRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()

        expect(runtimeMocks.retrieveRelevantMemories).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('Delivery 路径不读取也不写入 UserMemory', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.startDeliveryChainRun.mockResolvedValue(true)

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createDeliveryRequest(),
            writeChunk: vi.fn(),
        })

        await orchestrator.run()

        expect(runtimeMocks.startDeliveryChainRun).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.retrieveRelevantMemories).not.toHaveBeenCalled()
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('draft conversation identity 不会 enqueue UserMemory extraction', async () => {
        const session = createSession()
        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockResolvedValue('草稿回答。')

        const orchestrator = new ChatOrchestrator({
            context: {
                ...createExecutionContext(),
                validatedConversationId: undefined,
            },
            isClosed: () => false,
            request: {
                ...createRequest(),
                conversationId: '__draft__',
            },
            writeChunk: vi.fn(),
        })

        await orchestrator.run()
        await Promise.resolve()
        await Promise.resolve()

        expect(runtimeMocks.appendCompletedTurn).toHaveBeenCalledTimes(1)
        expect(runtimeMocks.processCompletedTurnForMemory).not.toHaveBeenCalled()
    })

    it('UserMemory 后处理保持 final-turn memory 先 append 再 finish，后台提取随后执行', async () => {
        const order: string[] = []
        const session = createSession()
        const writtenChunks: Array<{ type: string }> = []
        let resolveExtraction: (() => void) | undefined

        runtimeMocks.createChatSession.mockReturnValue(session)
        runtimeMocks.streamAssistantParts.mockResolvedValue('兼容回答。')
        runtimeMocks.appendCompletedTurn.mockImplementationOnce(async () => {
            order.push('append')
        })
        runtimeMocks.touchConversation.mockImplementationOnce(async () => {
            order.push('touch')
        })
        runtimeMocks.readThreadState.mockResolvedValue({
            restored: false,
            state: {
                messages: [],
                pinnedDecisions: ['尽量中文'],
                summary: '旧摘要',
            },
        })
        runtimeMocks.processCompletedTurnForMemory.mockImplementationOnce(
            () =>
                new Promise(resolve => {
                    order.push('extract-start')
                    resolveExtraction = () => {
                        order.push('extract-done')
                        resolve({
                            candidates: 0,
                            rejected: 0,
                            status: 'processed',
                            suppressed: 0,
                            updated: 0,
                            written: 0,
                        })
                    }
                })
        )

        const orchestrator = new ChatOrchestrator({
            context: createExecutionContext(),
            isClosed: () => false,
            request: createRequest(),
            writeChunk: chunk => {
                writtenChunks.push(chunk)
                if (chunk.type === 'finish') {
                    order.push('finish')
                }
            },
        })

        await orchestrator.run()
        expect(order).toEqual(['append', 'touch', 'extract-start', 'finish'])

        resolveExtraction?.()
        await Promise.resolve()

        expect(order).toEqual(['append', 'touch', 'extract-start', 'finish', 'extract-done'])
        expect(collectChunkTypes(writtenChunks)).toEqual(['start', 'finish'])
    })
})
