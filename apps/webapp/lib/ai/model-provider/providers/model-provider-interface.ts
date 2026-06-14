import type { BaseChatModel } from '@langchain/core/language_models/chat_models'

import type {
    AiMindLlmProvider,
    ModelProviderCapabilities,
    ModelProviderConfig,
    ModelRouteType,
    NormalizedProviderError,
    ResolvedModelSelection,
} from '../types'

export interface ModelProviderCreateOptions {
    config: ModelProviderConfig
    enableReasoning?: boolean
    maxOutputTokens?: number
    resolvedModelSelection: ResolvedModelSelection
    routeType: ModelRouteType
    temperature?: number
}

export interface ModelProvider {
    readonly capabilities: ModelProviderCapabilities
    readonly provider: AiMindLlmProvider
    createModel(options: ModelProviderCreateOptions): BaseChatModel
    /** 将 Provider 原始错误规范化为统一的 NormalizedProviderError */
    normalizeError(error: unknown): NormalizedProviderError
}
