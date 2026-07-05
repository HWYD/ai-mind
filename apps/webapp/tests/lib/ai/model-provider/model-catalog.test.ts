import { describe, expect, it } from 'vitest'

import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'

describe('model catalog', () => {
    it('锁定 v0.2.1 的 Qwen 与 DeepSeek 云模型白名单', () => {
        const cloudModels = modelCatalog
            .filter(item => item.provider !== 'ollama')
            .map(item => ({ family: item.family, id: item.id, provider: item.provider, providerModel: item.providerModel }))

        expect(cloudModels).toEqual([
            { family: 'deepseek', id: 'deepseek/deepseek-v4-flash', provider: 'qwen', providerModel: 'deepseek-v4-flash' },
            { family: 'deepseek', id: 'deepseek/deepseek-v4-pro', provider: 'qwen', providerModel: 'deepseek-v4-pro' },
            { family: 'qwen', id: 'qwen/qwen3.6-flash', provider: 'qwen', providerModel: 'qwen3.6-flash' },
            { family: 'qwen', id: 'qwen/qwen3.7-max', provider: 'qwen', providerModel: 'qwen3.7-max' },
            { family: 'doubao', id: 'doubao/Doubao-Seed-2.0-Code', provider: 'doubao', providerModel: 'Doubao-Seed-2.0-Code' },
            { family: 'doubao', id: 'doubao/doubao-seed-2.0-pro', provider: 'doubao', providerModel: 'doubao-seed-2.0-pro' },
            { family: 'doubao', id: 'doubao/doubao-seed-2.0-mini', provider: 'doubao', providerModel: 'doubao-seed-2.0-mini' },
            { family: 'kimi', id: 'doubao/Kimi-K2.6', provider: 'doubao', providerModel: 'Kimi-K2.6' },
        ])
    })
})
