import { getModelProviderConfig } from '../provider-config'
import type { AiMindModelCatalogItem, ModelProviderConfig, ModelRuntimeEnvironment, PublicChatModel } from '../types'
import { modelCatalog } from './model-catalog'

export interface ResolvedPublicModelList {
    defaultModelId: string
    models: PublicChatModel[]
}

export class PublicModelListError extends Error {
    readonly code: 'default_model_unavailable' | 'provider_config_invalid'

    constructor(code: 'default_model_unavailable' | 'provider_config_invalid', message: string) {
        super(message)
        this.code = code
        this.name = 'PublicModelListError'
    }
}

export function resolvePublicModelList(
    env: Record<string, string | undefined> = process.env,
    nodeEnv: string | undefined = process.env.NODE_ENV,
    catalog: AiMindModelCatalogItem[] = modelCatalog,
    config: ModelProviderConfig = getModelProviderConfig(env)
): ResolvedPublicModelList {
    const runtimeEnvironment = resolveRuntimeEnvironment(nodeEnv)
    const visibleCatalogItems = catalog.filter(item => isPublicModelVisible(item, config, runtimeEnvironment))
    const defaultModel = visibleCatalogItems.find(item => item.id === config.defaultModelId)

    if (!defaultModel) {
        throw new PublicModelListError(
            'default_model_unavailable',
            `Default model "${config.defaultModelId}" is not available in current public model list.`
        )
    }

    return {
        defaultModelId: defaultModel.id,
        models: visibleCatalogItems.map(item => ({
            id: item.id,
            label: item.label,
            provider: item.provider,
        })),
    }
}

function resolveRuntimeEnvironment(nodeEnv: string | undefined): ModelRuntimeEnvironment {
    return nodeEnv === 'production' ? 'production' : 'development'
}

function isPublicModelVisible(
    item: AiMindModelCatalogItem,
    config: ModelProviderConfig,
    runtimeEnvironment: ModelRuntimeEnvironment
): boolean {
    if (!item.enabled) {
        return false
    }

    if (!item.capabilities.chat) {
        return false
    }

    if (!item.availableIn.includes(runtimeEnvironment)) {
        return false
    }

    if (!config.allowedProviders.includes(item.provider)) {
        return false
    }

    switch (item.provider) {
        case 'ollama':
            return Boolean(config.ollama.baseURL)
        case 'deepseek':
            return Boolean(config.deepseek.apiKey)
        case 'qwen':
            return Boolean(config.qwen.apiKey)
        case 'doubao':
            return Boolean(config.doubao.apiKey)
    }
}
