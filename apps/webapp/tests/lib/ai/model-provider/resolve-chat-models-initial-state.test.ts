import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiMindLlmProvider, AiMindModelCatalogItem } from '@/lib/ai/model-provider'
import { resolveChatModelsInitialState } from '@/lib/ai/model-provider'
import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'

function requireCatalogItem(modelId: string): AiMindModelCatalogItem {
    const item = modelCatalog.find(candidate => candidate.id === modelId)

    if (!item) {
        throw new Error(`Model catalog item not found in test: ${modelId}`)
    }

    return item
}

function stubProviderAvailability(provider: AiMindLlmProvider) {
    switch (provider) {
        case 'deepseek':
            vi.stubEnv('AI_MIND_DEEPSEEK_API_KEY', 'deepseek-key')
            return
        case 'doubao':
            vi.stubEnv('AI_MIND_DOUBAO_API_KEY', 'doubao-key')
            return
        case 'ollama':
            vi.stubEnv('AI_MIND_OLLAMA_BASE_URL', 'http://127.0.0.1:11434')
            return
        case 'qwen':
            vi.stubEnv('AI_MIND_QWEN_API_KEY', 'qwen-key')
            return
    }
}

describe('resolveChatModelsInitialState', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    // 注意：deepseek 这类 family 可以切换到底层不同 provider，测试应跟随 catalog 当前 provider，
    // 不能把 family -> provider 映射写死，否则切换供应商时首屏模型初始态测试会无意义地失败。
    it('服务端可直接返回公开模型列表给首屏使用，并按 catalog 当前 provider 暴露 deepseek family', () => {
        const qwenModel = requireCatalogItem('qwen/qwen3.6-flash')
        const deepseekModel = requireCatalogItem('deepseek/deepseek-v4-flash')

        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', [...new Set([qwenModel.provider, deepseekModel.provider])].join(','))
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', qwenModel.id)
        stubProviderAvailability(qwenModel.provider)
        stubProviderAvailability(deepseekModel.provider)

        const result = resolveChatModelsInitialState()

        expect(result.modelError).toBeNull()
        expect(result.defaultModelId).toBe(qwenModel.id)
        expect(result.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    family: qwenModel.family,
                    id: qwenModel.id,
                    provider: qwenModel.provider,
                }),
                expect.objectContaining({
                    family: deepseekModel.family,
                    id: deepseekModel.id,
                    provider: deepseekModel.provider,
                }),
            ])
        )
    })

    it('Provider 配置不可用时返回前端可展示的错误初始态', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')
        vi.stubEnv('AI_MIND_QWEN_API_KEY', '')

        const result = resolveChatModelsInitialState()

        expect(result).toEqual({
            defaultModelId: 'ollama/qwen3-8b',
            modelError: '当前没有可用模型，请检查服务端模型配置。',
            models: [],
        })
    })
})
