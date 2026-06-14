import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/ai/models/route'

describe('GET /api/ai/models', () => {
    beforeEach(() => {
        // 测试必须与开发机的 User 环境隔离，避免真实云 Provider 配置改变默认场景。
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', '')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', '')
        vi.stubEnv('AI_MIND_DEEPSEEK_API_KEY', '')
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
                    id: 'qwen/qwen3.6-flash',
                    provider: 'qwen',
                }),
            ])
        )
    })

    it('DeepSeek / Qwen 未配置 API Key 时不返回对应模型', async () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'ollama,qwen,deepseek')

        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body.models.some((model: { provider: string }) => model.provider === 'qwen')).toBe(false)
        expect(body.models.some((model: { provider: string }) => model.provider === 'deepseek')).toBe(false)
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
