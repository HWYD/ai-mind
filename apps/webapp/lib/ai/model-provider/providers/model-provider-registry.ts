import type { AiMindChatModelHandle, AiMindLlmProvider, ModelProviderConfig, ResolvedModelSelection } from '../types'
import { createDeepSeekProvider } from './deepseek-provider'
import type { ModelProvider, ModelProviderCreateOptions } from './model-provider-interface'
import { OllamaProvider } from './ollama-provider'
import { createQwenProvider } from './qwen-provider'

const providerInstances: Record<AiMindLlmProvider, ModelProvider> = {
    deepseek: createDeepSeekProvider(),
    ollama: new OllamaProvider(),
    qwen: createQwenProvider(),
}

function getProvider(provider: AiMindLlmProvider): ModelProvider {
    return providerInstances[provider]
}

export interface CreateChatModelOptions {
    config: ModelProviderConfig
    enableReasoning?: boolean
    maxOutputTokens?: number
    resolvedModelSelection: ResolvedModelSelection
    temperature?: number
}

/**
 * 统一模型创建入口。
 * 根据 resolvedModelSelection.provider 路由到对应 Provider 实现，返回 AiMindChatModelHandle。
 */
export function createChatModel(options: CreateChatModelOptions): AiMindChatModelHandle {
    const { config, resolvedModelSelection } = options
    const provider = getProvider(resolvedModelSelection.provider)

    const createOptions: ModelProviderCreateOptions = {
        config,
        enableReasoning: options.enableReasoning,
        maxOutputTokens: options.maxOutputTokens,
        resolvedModelSelection,
        routeType: resolvedModelSelection.routeType,
        temperature: options.temperature,
    }

    const model = provider.createModel(createOptions)

    const handle: AiMindChatModelHandle = {
        capabilities: provider.capabilities,
        model,
        modelId: resolvedModelSelection.modelId,
        normalizeError: (error: unknown) => provider.normalizeError(error),
        provider: resolvedModelSelection.provider,
        providerModel: resolvedModelSelection.providerModel,
    }

    if (provider.capabilities.toolCalling) {
        handle.bindTools = (tools: unknown[]) => model.bindTools(tools as Parameters<typeof model.bindTools>[0])
    }

    return handle
}
