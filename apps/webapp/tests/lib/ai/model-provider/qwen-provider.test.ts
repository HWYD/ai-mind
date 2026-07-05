import { describe, expect, it } from 'vitest'

import type { ModelProviderConfig, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel } from '@/lib/ai/model-provider'
import { OpenAICompatibleProviderError } from '@/lib/ai/model-provider/providers/openai-compatible-provider'
import { createQwenProvider } from '@/lib/ai/model-provider/providers/qwen-provider'

function createTestConfig(apiKey?: string): ModelProviderConfig {
    return {
        allowedProviders: ['qwen'],
        chatMaxOutputTokens: 4096,
        deepseek: { apiKey: undefined, baseURL: 'https://api.deepseek.com' },
        defaultModelId: 'qwen/qwen3.6-flash',
        doubao: { apiKey: undefined, baseURL: 'https://ark.cn-beijing.volces.com/api/v3' },
        maxInputChars: 12000,
        ollama: { baseURL: 'http://127.0.0.1:11434' },
        qwen: {
            apiKey,
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        },
        tasklistMaxOutputTokens: 8192,
        temperature: 0.7,
        timeoutMs: 60000,
    }
}

function createTestSelection(): ResolvedModelSelection {
    return {
        catalogItem: {
            availableIn: ['production'],
            capabilities: {
                chat: true,
                embedding: false,
                jsonOutput: true,
                streaming: true,
                tasklist: true,
                toolCalling: true,
            },
            enabled: true,
            family: 'qwen',
            id: 'qwen/qwen3.6-flash',
            label: 'Qwen 3.6 Flash',
            modelKey: 'qwen3.6-flash',
            provider: 'qwen',
            providerModel: 'qwen3.6-flash',
        },
        modelId: 'qwen/qwen3.6-flash',
        provider: 'qwen',
        providerModel: 'qwen3.6-flash',
        routeType: 'chat',
    }
}

describe('Qwen Provider', () => {
    it('createQwenProvider 返回 ModelProvider', () => {
        const provider = createQwenProvider()

        expect(provider.provider).toBe('qwen')
        expect(provider.capabilities.streaming).toBe(true)
        expect(provider.capabilities.toolCalling).toBe(true)
        expect(provider.capabilities.reasoning).toBe(false)
        expect(provider.capabilities.usageInStream).toBe(true)
    })

    it('缺 API Key 时 fail closed（MODEL_PROVIDER_NOT_CONFIGURED）', () => {
        const provider = createQwenProvider()

        expect(() =>
            provider.createModel({
                config: createTestConfig(undefined),
                resolvedModelSelection: createTestSelection(),
                routeType: 'chat',
            })
        ).toThrow(OpenAICompatibleProviderError)

        try {
            provider.createModel({
                config: createTestConfig(undefined),
                resolvedModelSelection: createTestSelection(),
                routeType: 'chat',
            })
        } catch (error) {
            expect(error).toBeInstanceOf(OpenAICompatibleProviderError)
            if (error instanceof OpenAICompatibleProviderError) {
                expect(error.code).toBe('MODEL_PROVIDER_NOT_CONFIGURED')
                expect(error.provider).toBe('qwen')
            }
        }
    })

    it('有 API Key 时通过 createChatModel 创建 model handle', () => {
        const handle = createChatModel({
            config: createTestConfig('sk-test-qwen'),
            resolvedModelSelection: createTestSelection(),
        })

        expect(handle.provider).toBe('qwen')
        expect(handle.modelId).toBe('qwen/qwen3.6-flash')
        expect(handle.providerModel).toBe('qwen3.6-flash')
        expect(handle.model).toBeDefined()
        expect(typeof handle.bindTools).toBe('function')
    })
})
