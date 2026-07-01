import { describe, expect, it } from 'vitest'

import { getModelProviderConfig, modelCatalog, ModelProviderConfigError } from '@/lib/ai/model-provider'

describe('model-provider config', () => {
    it('默认使用本地 Ollama 模型，并允许本地开发可切换的 provider', () => {
        expect(getModelProviderConfig({})).toEqual({
            allowedProviders: ['ollama', 'deepseek', 'qwen', 'doubao'],
            chatMaxOutputTokens: 4096,
            deepseek: {
                apiKey: undefined,
                baseURL: 'https://api.deepseek.com',
            },
            defaultModelId: 'ollama/qwen3-8b',
            doubao: {
                apiKey: undefined,
                baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
            },
            maxInputChars: 12000,
            ollama: {
                baseURL: 'http://127.0.0.1:11434',
            },
            qwen: {
                apiKey: undefined,
                baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            },
            tasklistMaxOutputTokens: 8192,
            temperature: 0.7,
            timeoutMs: 60000,
        })
    })

    it('支持通过 env 配置默认模型、allowed providers 和通用模型参数', () => {
        expect(
            getModelProviderConfig({
                AI_MIND_ALLOWED_PROVIDERS: 'qwen,deepseek,qwen',
                AI_MIND_CHAT_MAX_OUTPUT_TOKENS: '2048',
                AI_MIND_DEEPSEEK_API_KEY: 'deepseek-key',
                AI_MIND_DEEPSEEK_BASE_URL: 'https://deepseek.example/v1',
                AI_MIND_DEFAULT_MODEL_ID: 'qwen/qwen3.6-flash',
                AI_MIND_LLM_TEMPERATURE: '0.2',
                AI_MIND_LLM_TIMEOUT_MS: '45000',
                AI_MIND_MAX_INPUT_CHARS: '6000',
                AI_MIND_QWEN_API_KEY: 'qwen-key',
                AI_MIND_QWEN_BASE_URL: 'https://qwen.example/v1',
                AI_MIND_TASKLIST_MAX_OUTPUT_TOKENS: '4096',
            })
        ).toEqual({
            allowedProviders: ['qwen', 'deepseek'],
            chatMaxOutputTokens: 2048,
            deepseek: {
                apiKey: 'deepseek-key',
                baseURL: 'https://deepseek.example/v1',
            },
            defaultModelId: 'qwen/qwen3.6-flash',
            doubao: {
                apiKey: undefined,
                baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
            },
            maxInputChars: 6000,
            ollama: {
                baseURL: 'http://127.0.0.1:11434',
            },
            qwen: {
                apiKey: 'qwen-key',
                baseURL: 'https://qwen.example/v1',
            },
            tasklistMaxOutputTokens: 4096,
            temperature: 0.2,
            timeoutMs: 45000,
        })
    })

    it('非法 allowed providers fail closed', () => {
        expect(() =>
            getModelProviderConfig({
                AI_MIND_ALLOWED_PROVIDERS: 'qwen,unknown',
                AI_MIND_DEFAULT_MODEL_ID: 'qwen/qwen3.6-flash',
            })
        ).toThrow(ModelProviderConfigError)
    })

    it('默认模型未命中 catalog 时 fail closed', () => {
        expect(() =>
            getModelProviderConfig({
                AI_MIND_DEFAULT_MODEL_ID: 'unknown/model',
            })
        ).toThrow(ModelProviderConfigError)
    })

    it('默认模型 provider 不在 allowed providers 中时 fail closed', () => {
        expect(() =>
            getModelProviderConfig({
                AI_MIND_ALLOWED_PROVIDERS: 'ollama',
                AI_MIND_DEFAULT_MODEL_ID: 'qwen/qwen3.6-flash',
            })
        ).toThrow(ModelProviderConfigError)
    })

    it('不读取 AI_MIND_OLLAMA_MODEL 作为第二模型来源', () => {
        expect(
            getModelProviderConfig({
                AI_MIND_OLLAMA_MODEL: 'qwen3:14b',
            }).ollama
        ).toEqual({
            baseURL: 'http://127.0.0.1:11434',
        })
    })
})

describe('model-provider catalog', () => {
    it('包含本地 Ollama 默认模型，并用 providerModel 保存底层真实模型名', () => {
        expect(modelCatalog).toContainEqual(
            expect.objectContaining({
                capabilities: expect.objectContaining({
                    chat: true,
                    embedding: false,
                    jsonOutput: true,
                    streaming: true,
                    tasklist: true,
                    toolCalling: true,
                }),
                id: 'ollama/qwen3-8b',
                modelKey: 'qwen3-8b',
                provider: 'ollama',
                providerModel: 'qwen3:8b',
            })
        )
    })

    it('不把 embedding 模型放进 chat catalog', () => {
        expect(modelCatalog.some(item => item.id.includes('mxbai') || item.providerModel.includes('mxbai'))).toBe(false)
    })
})
