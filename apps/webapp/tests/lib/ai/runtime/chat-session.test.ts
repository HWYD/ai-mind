import { HumanMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(() => ({
        model: {
            stream: vi.fn(),
        },
    })),
    getModelProviderConfig: vi.fn(() => ({
        chatMaxOutputTokens: 1000,
        defaultModelId: 'ollama/qwen3-8b',
        maxInputChars: 12000,
        tasklistMaxOutputTokens: 1000,
        temperature: 0.2,
        timeoutMs: 1000,
    })),
}))

vi.mock('@/lib/ai/model-provider', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/ai/model-provider')>()

    return {
        ...actual,
        createChatModel: modelProviderMocks.createChatModel,
        getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    }
})

const capabilityMocks = vi.hoisted(() => ({
    resolveGeneralToolBinding: vi.fn(async () => ({
        activeToolCapabilityIds: [],
        activeToolDefinitionMap: new Map(),
        activeToolNames: [],
        activeTools: [],
    })),
}))

vi.mock('@/lib/ai/capabilities', () => ({
    resolveGeneralToolBinding: capabilityMocks.resolveGeneralToolBinding,
}))

const skillRouterMocks = vi.hoisted(() => ({
    resolveSkillDefinitionForRequest: vi.fn(() => undefined),
}))

vi.mock('@/lib/ai/skills/router', () => ({
    resolveSkillDefinitionForRequest: skillRouterMocks.resolveSkillDefinitionForRequest,
}))

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatSession } from '@/lib/ai/runtime/chat-session'
import type { ChatSession } from '@/lib/ai/runtime/types'
import type { ChatRequest } from '@/lib/ai/types/chat'

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
        label: 'qwen3-8b',
        modelKey: 'qwen3-8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
    },
    modelId: 'ollama/qwen3-8b',
    provider: 'ollama',
    providerModel: 'qwen3:8b',
    routeType: 'chat',
}

function createRequest(): ChatRequest {
    return {
        conversationId: 'server-authoritative-context',
        messages: [
            {
                role: 'user',
                parts: [{ format: 'markdown', text: '第一轮旧问题', type: 'text' }],
            },
            {
                role: 'assistant',
                parts: [{ format: 'markdown', text: '第一轮旧回答', type: 'text' }],
            },
            {
                role: 'user',
                parts: [{ format: 'markdown', text: '当前最新问题', type: 'text' }],
            },
        ],
    }
}

describe('runtime/chat-session', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        skillRouterMocks.resolveSkillDefinitionForRequest.mockReturnValue(undefined)
    })

    it('普通 chat memory 路径只把最新 user message 作为当前 turn 输入', async () => {
        const session = await createChatSession(createRequest(), resolvedModelSelection)

        expect(session.langChainMessages).toEqual([new HumanMessage('当前最新问题')])
        expect(session).not.toHaveProperty('directAnswerMessages')
        expect(session).not.toHaveProperty('toolBoundModel')
        expect(modelProviderMocks.createChatModel).toHaveBeenCalledWith(
            expect.objectContaining({
                maxRetries: 0,
                resolvedModelSelection,
            })
        )
    })

    it('loop 与仅异常触发的 finalizer 是仅有的 Agent model phase', () => {
        type Phase = Parameters<ChatSession['createPhaseModel']>[0]['phase']

        expectTypeOf<Phase>().toEqualTypeOf<'finalizer' | 'loop'>()
    })

    it('Skill 选择只影响 prompt，不参与 General Tool policy', async () => {
        skillRouterMocks.resolveSkillDefinitionForRequest.mockReturnValue({
            description: 'reader prompt only',
            name: '阅读技能',
            skillId: 'reader-skill',
            systemPrompt: '只基于已注入上下文回答。',
        })

        await createChatSession(createRequest(), resolvedModelSelection)

        expect(capabilityMocks.resolveGeneralToolBinding).toHaveBeenCalledWith()
        expect(capabilityMocks.resolveGeneralToolBinding).toHaveBeenCalledTimes(1)
    })

    it('为 loop 与受限 finalizer 构建独立的服务端提示词投影', async () => {
        capabilityMocks.resolveGeneralToolBinding.mockResolvedValueOnce({
            activeToolCapabilityIds: [],
            activeToolDefinitionMap: new Map(),
            activeToolNames: ['web-search', 'read-url', 'calculator'],
            activeTools: [],
        })
        skillRouterMocks.resolveSkillDefinitionForRequest.mockReturnValue({
            description: 'reader prompt only',
            name: '阅读技能',
            outputPolicy: 'context-reader',
            skillId: 'reader-skill',
            systemPrompt: 'ACTION_SKILL: 命中时必须调用工具。',
        })

        const session = await createChatSession(createRequest(), resolvedModelSelection)
        const loopPrompt = session.loopSystemPrompts.join('\n')
        const finalizerPrompt = session.finalizerSystemPrompts.join('\n')

        expect(loopPrompt).toContain('直接发起合法的 tool call')
        expect(loopPrompt).toContain('直接成为面向用户的最终回答')
        expect(loopPrompt).toContain('当前 Run 的真实 observation')
        expect(finalizerPrompt).toContain('适中的必要解释')
        expect(finalizerPrompt).toContain('当前 Run 的真实 observation')
        expect(finalizerPrompt).toContain('用户明确要求简短、详细、步骤、表格或特定格式时')
        expect(finalizerPrompt).not.toContain('直接发起合法的 tool call')
        expect(finalizerPrompt).not.toContain('当前这一轮真正可用的工具只有')
        expect(finalizerPrompt).not.toContain('ACTION_SKILL: 命中时必须调用工具。')
    })

    it('loop 与受限 finalizer 使用同一已解析模型和请求配置创建真实模型', async () => {
        const actionModel = { stream: vi.fn() }
        const answerModel = { stream: vi.fn() }
        modelProviderMocks.createChatModel
            .mockReturnValueOnce({ model: { stream: vi.fn() } })
            .mockReturnValueOnce({ model: actionModel })
            .mockReturnValueOnce({ model: answerModel })

        const session = await createChatSession(createRequest(), resolvedModelSelection)
        const signal = new AbortController().signal

        expect(
            session.createPhaseModel({
                maxRetries: 0,
                phase: 'loop',
                signal,
                timeoutMs: 321,
            })
        ).toBe(actionModel)
        expect(
            session.createPhaseModel({
                maxRetries: 0,
                phase: 'finalizer',
                signal,
                timeoutMs: 654,
            })
        ).toBe(answerModel)

        expect(modelProviderMocks.createChatModel).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                enableReasoning: undefined,
                maxOutputTokens: undefined,
                maxRetries: 0,
                resolvedModelSelection,
                streaming: true,
                temperature: undefined,
                timeoutMs: 321,
            })
        )
        expect(modelProviderMocks.createChatModel).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({
                enableReasoning: undefined,
                maxOutputTokens: undefined,
                maxRetries: 0,
                resolvedModelSelection,
                streaming: true,
                temperature: undefined,
                timeoutMs: 654,
            })
        )
    })
})
