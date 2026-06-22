import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI } from '@langchain/openai'

import type { AiMindLlmProvider, ModelProviderCapabilities, NormalizedProviderError } from '../types'
import { createModelUsageCallback } from '../usage/model-usage-observer'
import type { ModelProvider, ModelProviderCreateOptions } from './model-provider-interface'

/**
 * OpenAI-compatible Provider 错误。
 * 用于在 createModel 阶段表达 provider 配置缺失等问题。
 */
export class OpenAICompatibleProviderError extends Error {
    readonly code: 'MODEL_PROVIDER_NOT_CONFIGURED' | 'MODEL_PROVIDER_AUTH_FAILED'

    readonly provider: AiMindLlmProvider

    constructor(code: 'MODEL_PROVIDER_NOT_CONFIGURED' | 'MODEL_PROVIDER_AUTH_FAILED', provider: AiMindLlmProvider, message: string) {
        super(message)
        this.code = code
        this.provider = provider
        this.name = 'OpenAICompatibleProviderError'
    }
}

function resolveProviderApiKey(config: ModelProviderCreateOptions['config'], provider: AiMindLlmProvider): string | undefined {
    switch (provider) {
        case 'deepseek':
            return config.deepseek.apiKey
        case 'qwen':
            return config.qwen.apiKey
        default:
            return undefined
    }
}

function resolveProviderBaseURL(config: ModelProviderCreateOptions['config'], provider: AiMindLlmProvider): string {
    switch (provider) {
        case 'deepseek':
            return config.deepseek.baseURL
        case 'qwen':
            return config.qwen.baseURL
        default:
            return ''
    }
}

/**
 * 通用 OpenAI-compatible Provider 底座。
 * DeepSeek / Qwen 等 Provider 通过构造函数注入 provider 标识和 capabilities，
 * createModel 时通过 config 读取 apiKey / baseURL 并构建 ChatOpenAI。
 */
export class OpenAICompatibleProvider implements ModelProvider {
    readonly capabilities: ModelProviderCapabilities
    readonly provider: AiMindLlmProvider

    constructor(provider: AiMindLlmProvider, capabilities: ModelProviderCapabilities) {
        this.provider = provider
        this.capabilities = capabilities
    }

    createModel(options: ModelProviderCreateOptions): BaseChatModel {
        const { config, resolvedModelSelection } = options

        const apiKey = resolveProviderApiKey(config, this.provider)

        if (!apiKey) {
            throw new OpenAICompatibleProviderError(
                'MODEL_PROVIDER_NOT_CONFIGURED',
                this.provider,
                `API Key for provider "${this.provider}" is not configured.`
            )
        }

        const baseURL = resolveProviderBaseURL(config, this.provider)
        const temperature = options.temperature ?? config.temperature
        const configMaxOutputTokens =
            resolvedModelSelection.routeType === 'tasklist' ? config.tasklistMaxOutputTokens : config.chatMaxOutputTokens
        const maxOutputTokens =
            options.maxOutputTokens != null ? Math.min(options.maxOutputTokens, configMaxOutputTokens) : configMaxOutputTokens
        const modelName = resolvedModelSelection.providerModel

        return new ChatOpenAI({
            apiKey,
            callbacks: [createModelUsageCallback(resolvedModelSelection)],
            configuration: {
                baseURL,
            },
            maxRetries: options.maxRetries,
            maxTokens: maxOutputTokens,
            model: modelName,
            streaming: true,
            temperature,
            timeout: options.timeoutMs ?? config.timeoutMs,
            // 当前 Qwen / DeepSeek capability 未声明 reasoning；enableReasoning 与 Ollama 特有 think 均不透传。
        })
    }

    normalizeError(error: unknown): NormalizedProviderError {
        const message = error instanceof Error ? error.message : String(error)
        const code = (error as { code?: unknown }).code
        const status = (error as Record<string, unknown>).status as number | undefined

        // 401 / 403 → 鉴权失败
        if (
            status === 401 ||
            status === 403 ||
            message.includes('401') ||
            message.includes('403') ||
            message.includes('Unauthorized') ||
            message.includes('Forbidden')
        ) {
            return {
                code: 'MODEL_PROVIDER_AUTH_FAILED',
                message: 'API Key 无效或已过期，请检查配置后重试。',
                retryable: false,
                logMeta: { provider: this.provider, errorType: 'auth', status },
            }
        }

        // 402 / 余额不足 / 额度不足
        if (
            status === 402 ||
            message.includes('402') ||
            message.includes('insufficient') ||
            message.includes('InsufficientQuota') ||
            message.includes('balance')
        ) {
            return {
                code: 'MODEL_PROVIDER_INSUFFICIENT_BALANCE',
                message: '模型账户余额不足或额度已用完，请检查账户状态。',
                retryable: false,
                logMeta: { provider: this.provider, errorType: 'balance', status },
            }
        }

        // 429 → rate limit
        if (
            status === 429 ||
            message.includes('429') ||
            message.includes('rate limit') ||
            message.includes('RateLimit') ||
            message.includes('Too Many Requests')
        ) {
            return {
                code: 'MODEL_PROVIDER_RATE_LIMITED',
                message: '请求过于频繁，请稍后重试。',
                retryable: true,
                logMeta: { provider: this.provider, errorType: 'rateLimit', status },
            }
        }

        // context_length / token 超限
        if (
            message.includes('context_length') ||
            message.includes('ContextLengthExceeded') ||
            message.includes('maximum context length') ||
            message.includes('token')
        ) {
            return {
                code: 'MODEL_PROVIDER_INVALID_REQUEST',
                message: '请求内容超出模型处理上限，请缩短输入后重试。',
                retryable: false,
                logMeta: { provider: this.provider, errorType: 'contextLimit', status },
            }
        }

        // timeout
        if (
            code === 'MODEL_PROVIDER_TIMEOUT' ||
            message.includes('timeout') ||
            message.includes('timed out') ||
            message.includes('ETIMEDOUT') ||
            message.includes('Request timed out')
        ) {
            return {
                code: 'MODEL_PROVIDER_TIMEOUT',
                message: '模型响应超时，请稍后重试。',
                retryable: true,
                logMeta: { provider: this.provider, errorType: 'timeout', status },
            }
        }

        // 连接不可用
        if (
            message.includes('ECONNREFUSED') ||
            message.includes('ENOTFOUND') ||
            message.includes('fetch failed') ||
            message.includes('connect')
        ) {
            return {
                code: 'MODEL_PROVIDER_UNAVAILABLE',
                message: '模型服务暂时不可用，请稍后重试。',
                retryable: true,
                logMeta: { provider: this.provider, errorType: 'connection', status },
            }
        }

        // 通用流失败
        return {
            code: 'MODEL_STREAM_FAILED',
            message: '模型响应失败，请稍后重试。',
            retryable: true,
            logMeta: { provider: this.provider, errorType: 'stream', status },
        }
    }
}
