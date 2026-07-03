import { HumanMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/lib/ai/capabilities', () => ({
    resolveToolBindingForSkill: vi.fn(async () => ({
        activeToolCapabilityIds: [],
        activeToolDefinitionMap: new Map(),
        activeToolNames: [],
        activeTools: [],
    })),
}))

vi.mock('@/lib/ai/skills/router', () => ({
    resolveSkillDefinitionForRequest: vi.fn(() => undefined),
}))

import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatSession } from '@/lib/ai/runtime/chat-session'
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
    })

    it('普通 chat memory 路径只把最新 user message 作为当前 turn 输入', async () => {
        const session = await createChatSession(createRequest(), resolvedModelSelection)

        expect(session.langChainMessages).toEqual([new HumanMessage('当前最新问题')])
        expect(session.directAnswerMessages).toEqual([new HumanMessage('当前最新问题')])
    })
})
