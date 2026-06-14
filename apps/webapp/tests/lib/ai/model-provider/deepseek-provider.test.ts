import { describe, expect, it } from 'vitest'

import type { ModelProviderConfig, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel } from '@/lib/ai/model-provider'
import { createDeepSeekProvider } from '@/lib/ai/model-provider/providers/deepseek-provider'
import { OpenAICompatibleProviderError } from '@/lib/ai/model-provider/providers/openai-compatible-provider'

function createTestConfig(apiKey?: string): ModelProviderConfig {
    return {
        allowedProviders: ['deepseek'],
        chatMaxOutputTokens: 4096,
        deepseek: {
            apiKey,
            baseURL: 'https://api.deepseek.com',
        },
        defaultModelId: 'deepseek/deepseek-v4-flash',
        maxInputChars: 12000,
        ollama: { baseURL: 'http://127.0.0.1:11434' },
        qwen: { apiKey: undefined, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
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
            id: 'deepseek/deepseek-v4-flash',
            label: 'DeepSeek V4 Flash',
            modelKey: 'deepseek-v4-flash',
            provider: 'deepseek',
            providerModel: 'deepseek-v4-flash',
        },
        modelId: 'deepseek/deepseek-v4-flash',
        provider: 'deepseek',
        providerModel: 'deepseek-v4-flash',
        routeType: 'chat',
    }
}

describe('DeepSeek Provider', () => {
    it('createDeepSeekProvider 返回 ModelProvider', () => {
        const provider = createDeepSeekProvider()

        expect(provider.provider).toBe('deepseek')
        expect(provider.capabilities.streaming).toBe(true)
        expect(provider.capabilities.toolCalling).toBe(true)
        expect(provider.capabilities.reasoning).toBe(false)
        expect(provider.capabilities.usageInStream).toBe(true)
    })

    it('缺 API Key 时 fail closed（MODEL_PROVIDER_NOT_CONFIGURED）', () => {
        const provider = createDeepSeekProvider()

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
                expect(error.provider).toBe('deepseek')
            }
        }
    })

    it('有 API Key 时通过 createChatModel 创建 model handle', () => {
        const handle = createChatModel({
            config: createTestConfig('sk-test-deepseek'),
            resolvedModelSelection: createTestSelection(),
        })

        expect(handle.provider).toBe('deepseek')
        expect(handle.modelId).toBe('deepseek/deepseek-v4-flash')
        expect(handle.providerModel).toBe('deepseek-v4-flash')
        expect(handle.model).toBeDefined()
        expect(typeof handle.bindTools).toBe('function')
    })
})
