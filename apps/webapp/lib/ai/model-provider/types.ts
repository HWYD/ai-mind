import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Runnable } from '@langchain/core/runnables'

export const aiMindLlmProviders = ['ollama', 'deepseek', 'qwen', 'doubao'] as const

export type AiMindLlmProvider = (typeof aiMindLlmProviders)[number]

export type ModelRouteType = 'chat' | 'delivery-chain' | 'tasklist'

export type ModelRuntimeEnvironment = 'development' | 'production'

export interface AiMindModelCatalogItem {
    availableIn: ModelRuntimeEnvironment[]
    capabilities: {
        chat: boolean
        embedding: boolean
        jsonOutput: boolean
        streaming: boolean
        tasklist: boolean
        toolCalling: boolean
    }
    enabled: boolean
    id: string
    label: string
    modelKey: string
    provider: AiMindLlmProvider
    providerModel: string
}

/**
 * 面向前端模型选择器的稳定公开契约。
 *
 * Provider 实际模型名、环境范围和能力矩阵属于服务端运行时实现细节，
 * 不通过 `/api/ai/models` 暴露，避免前端与外部供应商配置产生耦合。
 */
export interface PublicChatModel {
    id: string
    label: string
    provider: AiMindLlmProvider
}

export interface ModelProviderCapabilities {
    jsonOutput: boolean
    reasoning: boolean
    streaming: boolean
    toolCalling: boolean
    usageInStream: boolean
}

export interface ResolvedModelSelection {
    catalogItem: AiMindModelCatalogItem
    modelId: string
    provider: AiMindLlmProvider
    providerModel: string
    routeType: ModelRouteType
}

export interface AiMindChatModelHandle {
    bindTools?: (tools: unknown[]) => Runnable
    capabilities: ModelProviderCapabilities
    model: BaseChatModel
    modelId: string
    normalizeError: (error: unknown) => NormalizedProviderError
    provider: AiMindLlmProvider
    providerModel: string
}

export interface ModelProviderConfig {
    allowedProviders: AiMindLlmProvider[]
    chatMaxOutputTokens: number
    deepseek: {
        apiKey?: string
        baseURL: string
    }
    defaultModelId: string
    maxInputChars: number
    ollama: {
        baseURL: string
    }
    qwen: {
        apiKey?: string
        baseURL: string
    }
    doubao: {
        apiKey?: string
        baseURL: string
    }
    tasklistMaxOutputTokens: number
    temperature: number
    timeoutMs: number
}

export interface NormalizedModelUsage {
    estimated?: boolean
    inputTokens?: number
    modelId: string
    outputTokens?: number
    provider: AiMindLlmProvider
    providerModel: string
    routeType: ModelRouteType | 'tool' | 'unknown'
    totalTokens?: number
}

export interface NormalizedProviderError {
    /** stream error code，与 stream-core 的 StreamErrorCode 对齐 */
    code: string
    /** 手写中文用户提示文案，不来自底层 error.message */
    message: string
    /** 是否为可重试错误 */
    retryable: boolean
    /** 脱敏日志用的 meta 信息 */
    logMeta: Record<string, unknown>
}
