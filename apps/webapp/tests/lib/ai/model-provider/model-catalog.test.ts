import { describe, expect, it } from 'vitest'

import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'

describe('model catalog', () => {
    it('锁定 v0.2.1 的 Qwen 与 DeepSeek 云模型白名单', () => {
        const cloudModels = modelCatalog
            .filter(item => item.provider !== 'ollama')
            .map(item => ({ id: item.id, providerModel: item.providerModel }))

        expect(cloudModels).toEqual([
            { id: 'deepseek/deepseek-v4-flash', providerModel: 'deepseek-v4-flash' },
            { id: 'deepseek/deepseek-v4-pro', providerModel: 'deepseek-v4-pro' },
            { id: 'qwen/qwen3.6-flash', providerModel: 'qwen3.6-flash' },
            { id: 'qwen/qwen3.7-plus', providerModel: 'qwen3.7-plus' },
            { id: 'doubao/Doubao-Seed-2.0-Code', providerModel: 'Doubao-Seed-2.0-Code' },
            { id: 'doubao/doubao-seed-2.0-pro', providerModel: 'doubao-seed-2.0-pro' },
            { id: 'doubao/doubao-seed-2.0-mini', providerModel: 'doubao-seed-2.0-mini' },
            { id: 'doubao/Kimi-K2.6', providerModel: 'Kimi-K2.6' },
        ])
    })
})
