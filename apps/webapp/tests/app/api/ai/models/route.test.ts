import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/ai/models/route'
import type { AiMindLlmProvider, AiMindModelCatalogItem } from '@/lib/ai/model-provider'
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

describe('GET /api/ai/models', () => {
    beforeEach(() => {
        // 注意：deepseek family 当前可能走 qwen / doubao / deepseek 任意一个 provider。
        // 测试必须把所有云 provider key 都清空，否则本机真实环境变量会让公开模型列表结果漂移。
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', '')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', '')
        vi.stubEnv('AI_MIND_DEEPSEEK_API_KEY', '')
        vi.stubEnv('AI_MIND_DOUBAO_API_KEY', '')
        vi.stubEnv('AI_MIND_QWEN_API_KEY', '')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('development 默认只返回配置层面可调用的本地 Ollama 模型', async () => {
        vi.stubEnv('NODE_ENV', 'development')

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.defaultModelId).toBe('ollama/qwen3-8b')
        expect(body.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    family: 'qwen',
                    id: 'ollama/qwen3-8b',
                    provider: 'ollama',
                }),
            ])
        )
        expect(body.models[0]).not.toHaveProperty('providerModel')
        expect(body.models[0]).not.toHaveProperty('modelKey')
        expect(body.models[0]).not.toHaveProperty('availableIn')
        expect(body.models[0]).not.toHaveProperty('capabilities')
        expect(body.models.some((model: { provider: string }) => model.provider === 'qwen')).toBe(false)
        expect(body.models.some((model: { provider: string }) => model.provider === 'deepseek')).toBe(false)
    })

    it('production allowed providers 不包含 Ollama 时不会返回本地模型', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen,deepseek')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')
        vi.stubEnv('AI_MIND_QWEN_API_KEY', 'qwen-key')

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.defaultModelId).toBe('qwen/qwen3.6-flash')
        expect(body.models.some((model: { provider: string }) => model.provider === 'ollama')).toBe(false)
        expect(body.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    family: 'qwen',
                    id: 'qwen/qwen3.6-flash',
                    provider: 'qwen',
                }),
            ])
        )
    })

    it('云 Provider 未配置 API Key 时不返回对应模型', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'ollama,qwen,deepseek,doubao')

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.models.every((model: { provider: string }) => model.provider === 'ollama')).toBe(true)
    })

    it('deepseek family 的可见性跟随 catalog 当前 provider，而不是跟随 family 名称', async () => {
        const deepseekModel = requireCatalogItem('deepseek/deepseek-v4-flash')

        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', deepseekModel.provider)
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', deepseekModel.id)
        stubProviderAvailability(deepseekModel.provider)

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.defaultModelId).toBe(deepseekModel.id)
        expect(body.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    family: 'deepseek',
                    id: deepseekModel.id,
                    provider: deepseekModel.provider,
                }),
            ])
        )
    })

    it('响应不包含 API Key、baseURL 或具体 env 缺失字段', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')
        vi.stubEnv('AI_MIND_QWEN_API_KEY', 'qwen-secret')
        vi.stubEnv('AI_MIND_QWEN_BASE_URL', 'https://qwen.example/v1')

        const response = await GET()
        const rawBody = await response.text()

        expect(response.status).toBe(200)
        expect(rawBody).not.toContain('qwen-secret')
        expect(rawBody).not.toContain('https://qwen.example/v1')
        expect(rawBody).not.toContain('AI_MIND_QWEN_API_KEY')
        expect(rawBody).not.toContain('baseURL')
    })

    it('默认模型不可返回时 fail closed 并返回标准化配置错误', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body).toEqual({
            error: 'Model provider configuration is invalid.',
            code: 'MODEL_PROVIDER_NOT_CONFIGURED',
        })
    })
})
