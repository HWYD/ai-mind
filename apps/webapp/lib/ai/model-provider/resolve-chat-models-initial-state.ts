import { type ChatModelsInitialState, defaultChatModel } from '@/lib/ai/models'

import { PublicModelListError, resolvePublicModelList } from './catalog/resolve-public-model-list'
import { ModelProviderConfigError } from './provider-config'

// 服务端首屏只需要拿到“可展示的公开模型列表”或“前端可展示的错误态”。
// 这里把 Provider 配置异常和运行时异常统一收口成客户端可直接消费的初始状态。
export function resolveChatModelsInitialState(): ChatModelsInitialState {
    try {
        const { defaultModelId, models } = resolvePublicModelList()

        return {
            defaultModelId,
            modelError: null,
            models,
        }
    } catch (error) {
        if (error instanceof ModelProviderConfigError || error instanceof PublicModelListError) {
            return {
                defaultModelId: defaultChatModel,
                modelError: '当前没有可用模型，请检查服务端模型配置。',
                models: [],
            }
        }

        // eslint-disable-next-line no-console
        console.error('AI model list failed:', error)

        return {
            defaultModelId: defaultChatModel,
            modelError: '模型列表加载失败，暂时无法切换模型。',
            models: [],
        }
    }
}
