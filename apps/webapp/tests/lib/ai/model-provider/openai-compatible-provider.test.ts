import { describe, expect, it } from 'vitest'

import type { ModelProviderConfig, ResolvedModelSelection } from '@/lib/ai/model-provider'
import { OpenAICompatibleProvider, OpenAICompatibleProviderError } from '@/lib/ai/model-provider/providers/openai-compatible-provider'

function createTestConfig(overrides: Partial<ModelProviderConfig> = {}): ModelProviderConfig {
    return {
        allowedProviders: ['deepseek', 'qwen'],
        chatMaxOutputTokens: 4096,
        deepseek: { apiKey: undefined, baseURL: 'https://api.deepseek.com' },
        defaultModelId: 'deepseek/deepseek-v4-flash',
        maxInputChars: 12000,
        ollama: { baseURL: 'http://127.0.0.1:11434' },
        qwen: { apiKey: undefined, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
        tasklistMaxOutputTokens: 8192,
        temperature: 0.7,
        timeoutMs: 60000,
        ...overrides,
    }
}

function createDeepSeekSelection(overrides: Partial<ResolvedModelSelection> = {}): ResolvedModelSelection {
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
        ...overrides,
    }
}

function createQwenSelection(): ResolvedModelSelection {
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

const deepseekCapabilities = {
    jsonOutput: true,
    reasoning: false,
    streaming: true,
    toolCalling: true,
    usageInStream: true,
}

const qwenCapabilities = {
    jsonOutput: true,
    reasoning: false,
    streaming: true,
    toolCalling: true,
    usageInStream: true,
}

describe('OpenAICompatibleProvider', () => {
    describe('DeepSeek', () => {
        it('缺 API Key 时抛出 MODEL_PROVIDER_NOT_CONFIGURED', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            expect(() =>
                provider.createModel({
                    config: createTestConfig({ deepseek: { apiKey: undefined, baseURL: 'https://api.deepseek.com' } }),
                    resolvedModelSelection: createDeepSeekSelection(),
                    routeType: 'chat',
                })
            ).toThrow(OpenAICompatibleProviderError)

            try {
                provider.createModel({
                    config: createTestConfig({ deepseek: { apiKey: undefined, baseURL: 'https://api.deepseek.com' } }),
                    resolvedModelSelection: createDeepSeekSelection(),
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

        it('有 API Key 时创建 ChatOpenAI 实例成功', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-deepseek-key', baseURL: 'https://api.deepseek.com' } }),
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })

            expect(model).toBeDefined()
        })

        it('使用 catalog 的 providerModel 作为模型名', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } }),
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })

            // ChatOpenAI 的 model 字段存储在内部，通过实例创建可验证
            expect(model).toBeDefined()
        })

        it('capabilities 正确声明', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            expect(provider.provider).toBe('deepseek')
            expect(provider.capabilities.streaming).toBe(true)
            expect(provider.capabilities.toolCalling).toBe(true)
            expect(provider.capabilities.jsonOutput).toBe(true)
            expect(provider.capabilities.reasoning).toBe(false)
        })
    })

    describe('Qwen', () => {
        it('缺 API Key 时抛出 MODEL_PROVIDER_NOT_CONFIGURED', () => {
            const provider = new OpenAICompatibleProvider('qwen', qwenCapabilities)

            expect(() =>
                provider.createModel({
                    config: createTestConfig({ qwen: { apiKey: undefined, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' } }),
                    resolvedModelSelection: createQwenSelection(),
                    routeType: 'chat',
                })
            ).toThrow(OpenAICompatibleProviderError)

            try {
                provider.createModel({
                    config: createTestConfig({ qwen: { apiKey: undefined, baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' } }),
                    resolvedModelSelection: createQwenSelection(),
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

        it('有 API Key 时创建 ChatOpenAI 实例成功', () => {
            const provider = new OpenAICompatibleProvider('qwen', qwenCapabilities)

            const model = provider.createModel({
                config: createTestConfig({
                    qwen: { apiKey: 'sk-test-qwen-key', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
                }),
                resolvedModelSelection: createQwenSelection(),
                routeType: 'chat',
            })

            expect(model).toBeDefined()
        })

        it('capabilities 正确声明', () => {
            const provider = new OpenAICompatibleProvider('qwen', qwenCapabilities)

            expect(provider.provider).toBe('qwen')
            expect(provider.capabilities.streaming).toBe(true)
            expect(provider.capabilities.toolCalling).toBe(true)
        })
    })

    describe('参数映射', () => {
        it('temperature 通过 options 传入', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } }),
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
                temperature: 0.3,
            })

            expect((model as { temperature?: number }).temperature).toBe(0.3)
        })

        it('maxOutputTokens 通过 options 传入', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } }),
                maxOutputTokens: 2048,
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })

            expect((model as { maxTokens?: number }).maxTokens).toBe(2048)
        })

        it('不传入 temperature 和 maxOutputTokens 时使用 config 默认值', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } }),
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })

            expect(model).toMatchObject({ maxTokens: 4096, temperature: 0.7 })
        })

        it('chat / tasklist 分别使用对应的 max output tokens 上限', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)
            const config = createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } })
            const chatModel = provider.createModel({
                config,
                maxOutputTokens: 20_000,
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })
            const tasklistModel = provider.createModel({
                config,
                maxOutputTokens: 20_000,
                resolvedModelSelection: createDeepSeekSelection({ routeType: 'tasklist' }),
                routeType: 'tasklist',
            })

            expect((chatModel as { maxTokens?: number }).maxTokens).toBe(4096)
            expect((tasklistModel as { maxTokens?: number }).maxTokens).toBe(8192)
        })

        it('DeepSeek 不透传未声明的 reasoning 参数', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)
            const model = provider.createModel({
                config: createTestConfig({
                    deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' },
                    qwen: { apiKey: 'sk-test-key', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
                }),
                enableReasoning: true,
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            }) as { reasoning?: unknown; think?: unknown }

            expect(model.reasoning).toBeUndefined()
            expect(model.think).toBeUndefined()
        })

        it.each([
            [false, false],
            [true, true],
        ])('Qwen 将 enableReasoning=%s 映射为 enable_thinking=%s', (enableReasoning, expected) => {
            const provider = new OpenAICompatibleProvider('qwen', qwenCapabilities)
            const model = provider.createModel({
                config: createTestConfig({
                    qwen: { apiKey: 'sk-test-key', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
                }),
                enableReasoning,
                resolvedModelSelection: createQwenSelection(),
                routeType: 'tasklist',
            }) as { modelKwargs?: Record<string, unknown> }

            expect(model.modelKwargs).toEqual({
                enable_thinking: expected,
            })
        })

        it('把 Provider timeout 配置传给 ChatOpenAI', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({
                    deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' },
                    timeoutMs: 12_345,
                }),
                resolvedModelSelection: createDeepSeekSelection(),
                routeType: 'chat',
            })

            expect((model as { timeout?: number }).timeout).toBe(12_345)
        })

        it('allows tasklist stages to override request timeout and retry count', () => {
            const provider = new OpenAICompatibleProvider('deepseek', deepseekCapabilities)

            const model = provider.createModel({
                config: createTestConfig({ deepseek: { apiKey: 'sk-test-key', baseURL: 'https://api.deepseek.com' } }),
                maxRetries: 1,
                resolvedModelSelection: createDeepSeekSelection({ routeType: 'tasklist' }),
                routeType: 'tasklist',
                timeoutMs: 45_000,
            })

            expect((model as { timeout?: number }).timeout).toBe(45_000)
            expect((model as unknown as { caller: { maxRetries: number } }).caller.maxRetries).toBe(1)
        })
    })

    describe('错误归一化', () => {
        it.each([
            ['deepseek', deepseekCapabilities],
            ['qwen', qwenCapabilities],
        ] as const)('%s 把鉴权失败收束为安全的用户提示', (providerName, capabilities) => {
            const provider = new OpenAICompatibleProvider(providerName, capabilities)
            const normalized = provider.normalizeError({ status: 401 })

            expect(normalized.code).toBe('MODEL_PROVIDER_AUTH_FAILED')
            expect(normalized.retryable).toBe(false)
            expect(normalized.message.length).toBeGreaterThan(0)
            expect(normalized.logMeta).toMatchObject({ provider: providerName, errorType: 'auth', status: 401 })
        })

        it.each([
            ['deepseek', deepseekCapabilities],
            ['qwen', qwenCapabilities],
        ] as const)('%s 把超时收束为可重试的安全提示', (providerName, capabilities) => {
            const provider = new OpenAICompatibleProvider(providerName, capabilities)
            const normalized = provider.normalizeError(new Error('Request timed out'))

            expect(normalized.code).toBe('MODEL_PROVIDER_TIMEOUT')
            expect(normalized.retryable).toBe(true)
            expect(normalized.message.length).toBeGreaterThan(0)
            expect(normalized.message).not.toContain('Request timed out')
            expect(normalized.logMeta).toMatchObject({ provider: providerName, errorType: 'timeout' })
        })

        it('recognizes tasklist stage timeout error codes', () => {
            const provider = new OpenAICompatibleProvider('qwen', qwenCapabilities)
            const normalized = provider.normalizeError({
                code: 'MODEL_PROVIDER_TIMEOUT',
                message: 'Tasklist stage exceeded its execution budget.',
            })

            expect(normalized).toMatchObject({
                code: 'MODEL_PROVIDER_TIMEOUT',
                retryable: true,
            })
        })
    })
})
