import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveChatModelsInitialState } from '@/lib/ai/model-provider'

describe('resolveChatModelsInitialState', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('服务端可直接返回公开模型列表给首屏使用', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')
        vi.stubEnv('AI_MIND_QWEN_API_KEY', 'qwen-key')

        const result = resolveChatModelsInitialState()

        expect(result.modelError).toBeNull()
        expect(result.defaultModelId).toBe('qwen/qwen3.6-flash')
        expect(result.models).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'qwen/qwen3.6-flash',
                    provider: 'qwen',
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
