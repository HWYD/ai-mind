import { describe, expect, it } from 'vitest'

import type { ModelProviderConfig, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel } from '@/lib/ai/model-provider'

function createTestConfig(overrides: Partial<ModelProviderConfig> = {}): ModelProviderConfig {
    return {
        allowedProviders: ['ollama', 'deepseek', 'qwen'],
        chatMaxOutputTokens: 4096,
        deepseek: { apiKey: undefined, baseURL: 'https://api.deepseek.com' },
        defaultModelId: 'ollama/qwen3-8b',
        maxInputChars: 12000,
        ollama: { baseURL: 'http://127.0.0.1:11434' },
        qwen: { apiKey: undefined, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
        tasklistMaxOutputTokens: 8192,
        temperature: 0.7,
        timeoutMs: 60000,
        ...overrides,
    }
}

function createTestSelection(overrides: Partial<ResolvedModelSelection> = {}): ResolvedModelSelection {
    return {
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
            label: 'Qwen3 8B Local',
            modelKey: 'qwen3-8b',
            provider: 'ollama',
            providerModel: 'qwen3:8b',
        },
        modelId: 'ollama/qwen3-8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
        routeType: 'chat',
        ...overrides,
    }
}

describe('Ollama Provider via createChatModel', () => {
    it('创建 ollama/qwen3-8b 时底层使用 providerModel qwen3:8b', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection(),
        })

        expect(handle.provider).toBe('ollama')
        expect(handle.modelId).toBe('ollama/qwen3-8b')
        expect(handle.providerModel).toBe('qwen3:8b')
        expect(handle.model).toBeDefined()
        expect(handle.capabilities.streaming).toBe(true)
        expect(handle.capabilities.toolCalling).toBe(true)
    })

    it('Ollama Provider 不要求 API Key', () => {
        const handle = createChatModel({
            config: createTestConfig({ ollama: { baseURL: 'http://localhost:11434' } }),
            resolvedModelSelection: createTestSelection(),
        })

        expect(handle.model).toBeDefined()
    })

    it('bindTools 能力存在', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection(),
        })

        expect(typeof handle.bindTools).toBe('function')
    })

    it('映射 temperature、max output tokens 和 reasoning 参数', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            enableReasoning: true,
            maxOutputTokens: 2048,
            resolvedModelSelection: createTestSelection(),
            temperature: 0.25,
        })
        const model = handle.model as { numPredict?: number; temperature?: number; think?: boolean }

        expect(model.temperature).toBe(0.25)
        expect(model.numPredict).toBe(2048)
        expect(model.think).toBe(true)
    })

    it('maps tasklist stage retry count', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            maxRetries: 1,
            resolvedModelSelection: createTestSelection({ routeType: 'tasklist' }),
        })

        expect((handle.model as unknown as { caller: { maxRetries: number } }).caller.maxRetries).toBe(1)
    })

    it('allows tasklist stages to disable streaming without changing the chat default', () => {
        const chatHandle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection(),
        })
        const tasklistHandle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection({ routeType: 'tasklist' }),
            streaming: false,
        })

        expect((chatHandle.model as { streaming?: boolean }).streaming).toBe(true)
        expect((tasklistHandle.model as { streaming?: boolean }).streaming).toBe(false)
    })

    it('chat / tasklist 分别使用对应上限，未启用 reasoning 时不强制开启 think', () => {
        const config = createTestConfig()
        const chatHandle = createChatModel({
            config,
            maxOutputTokens: 20_000,
            resolvedModelSelection: createTestSelection(),
        })
        const tasklistHandle = createChatModel({
            config,
            enableReasoning: false,
            maxOutputTokens: 20_000,
            resolvedModelSelection: createTestSelection({ routeType: 'tasklist' }),
        })

        expect(chatHandle.model).toMatchObject({ numPredict: 4096, temperature: 0.7, think: undefined })
        expect(tasklistHandle.model).toMatchObject({ numPredict: 8192, temperature: 0.7, think: false })
    })

    it('handle 属性完整', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection(),
        })

        expect(handle).toEqual(
            expect.objectContaining({
                capabilities: expect.objectContaining({
                    jsonOutput: true,
                    reasoning: true,
                    streaming: true,
                    toolCalling: true,
                }),
                modelId: 'ollama/qwen3-8b',
                provider: 'ollama',
                providerModel: 'qwen3:8b',
            })
        )
    })

    it('normalizes tasklist stage timeout as a safe provider error', () => {
        const handle = createChatModel({
            config: createTestConfig(),
            resolvedModelSelection: createTestSelection(),
        })
        const normalized = handle.normalizeError({
            code: 'MODEL_PROVIDER_TIMEOUT',
            message: 'Tasklist stage exceeded its execution budget.',
        })

        expect(normalized).toMatchObject({
            code: 'MODEL_PROVIDER_TIMEOUT',
            retryable: true,
        })
    })
})
