import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOllama } from '@langchain/ollama'

import type { ModelProviderCapabilities, NormalizedProviderError } from '../types'
import { createModelUsageCallback } from '../usage/model-usage-observer'
import type { ModelProvider, ModelProviderCreateOptions } from './model-provider-interface'

const ollamaCapabilities: ModelProviderCapabilities = {
    jsonOutput: true,
    reasoning: true,
    streaming: true,
    toolCalling: true,
    usageInStream: false,
}

export class OllamaProvider implements ModelProvider {
    readonly capabilities = ollamaCapabilities
    readonly provider = 'ollama' as const

    createModel(options: ModelProviderCreateOptions): BaseChatModel {
        const { config, resolvedModelSelection } = options
        const temperature = options.temperature ?? config.temperature
        const configMaxOutputTokens =
            resolvedModelSelection.routeType === 'tasklist' ? config.tasklistMaxOutputTokens : config.chatMaxOutputTokens
        const maxOutputTokens =
            options.maxOutputTokens != null ? Math.min(options.maxOutputTokens, configMaxOutputTokens) : configMaxOutputTokens

        return new ChatOllama({
            baseUrl: config.ollama.baseURL,
            callbacks: [createModelUsageCallback(resolvedModelSelection)],
            maxRetries: options.maxRetries,
            model: resolvedModelSelection.providerModel,
            numPredict: maxOutputTokens,
            streaming: options.streaming ?? true,
            temperature,
            // enableReasoning 只映射到明确声明支持 reasoning 的 Provider 参数。
            think: this.capabilities.reasoning ? options.enableReasoning : undefined,
        })
    }

    normalizeError(error: unknown): NormalizedProviderError {
        const message = error instanceof Error ? error.message : String(error)
        const code = (error as { code?: unknown }).code

        if (code === 'MODEL_PROVIDER_TIMEOUT' || message.includes('timeout') || message.includes('timed out')) {
            return {
                code: 'MODEL_PROVIDER_TIMEOUT',
                message: '模型响应超时，请稍后重试。',
                retryable: true,
                logMeta: { provider: 'ollama', errorType: 'timeout' },
            }
        }

        // Ollama 连接不可用：常见于 baseURL 无法访问、Ollama 未启动
        if (
            message.includes('ECONNREFUSED') ||
            message.includes('ENOTFOUND') ||
            message.includes('connect') ||
            message.includes('fetch failed')
        ) {
            return {
                code: 'MODEL_PROVIDER_UNAVAILABLE',
                message: '本地 Ollama 模型服务连接失败，请确认 Ollama 已启动。',
                retryable: true,
                logMeta: { provider: 'ollama', errorType: 'connection' },
            }
        }

        // 通用流失败
        return {
            code: 'MODEL_STREAM_FAILED',
            message: '本地模型响应失败，请稍后重试。',
            retryable: true,
            logMeta: { provider: 'ollama', errorType: 'stream' },
        }
    }
}
