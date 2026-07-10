import { describe, expect, it } from 'vitest'

import { aiMindLlmProviders } from '@/lib/ai/model-provider'
import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'

describe('model catalog', () => {
    // 注意：family 与 provider 故意解耦。像 deepseek 这类家族允许在 catalog 中改走 qwen / doubao / deepseek，
    // 因此这里锁定稳定的产品语义字段，不把 family -> provider 映射写死成单一供应商。
    it('锁定云模型目录的稳定 id / family / providerModel 契约', () => {
        const cloudModels = modelCatalog
            .filter(item => item.provider !== 'ollama')
            .map(item => ({ family: item.family, id: item.id, providerModel: item.providerModel }))

        expect(cloudModels).toEqual([
            { family: 'deepseek', id: 'deepseek/deepseek-v4-flash', providerModel: 'deepseek-v4-flash' },
            { family: 'deepseek', id: 'deepseek/deepseek-v4-pro', providerModel: 'deepseek-v4-pro' },
            { family: 'qwen', id: 'qwen/qwen3.6-flash', providerModel: 'qwen3.6-flash' },
            { family: 'qwen', id: 'qwen/qwen3.7-max', providerModel: 'qwen3.7-max' },
            { family: 'doubao', id: 'doubao/Doubao-Seed-2.0-Code', providerModel: 'Doubao-Seed-2.0-Code' },
            { family: 'doubao', id: 'doubao/doubao-seed-2.0-pro', providerModel: 'doubao-seed-2.0-pro' },
            { family: 'doubao', id: 'doubao/doubao-seed-2.0-mini', providerModel: 'doubao-seed-2.0-mini' },
            { family: 'kimi', id: 'doubao/Kimi-K2.6', providerModel: 'Kimi-K2.6' },
        ])
    })

    it('所有模型 provider 都必须属于项目支持的 provider 集合', () => {
        expect(modelCatalog.every(item => aiMindLlmProviders.includes(item.provider))).toBe(true)
    })
})
