import { describe, expect, it } from 'vitest'

import { TavilyWebProvider } from '@/lib/ai/tools/web/tavily-web-provider'
import { resolveOutboundKnownSecrets } from '@/lib/ai/tools/web/web-provider-config'
import { createConfiguredWebProvider } from '@/lib/ai/tools/web/web-provider-factory'
import { ZhipuWebProvider } from '@/lib/ai/tools/web/zhipu-web-provider'

describe('web-provider-factory', () => {
    it('未设置 selector 时保持 Tavily 兼容默认', () => {
        expect(createConfiguredWebProvider({ env: { TAVILY_API_KEY: 'tavily-key' } })).toBeInstanceOf(TavilyWebProvider)
    })

    it('选择 zhipu 时只创建 Zhipu provider', () => {
        expect(
            createConfiguredWebProvider({
                env: {
                    AI_MIND_WEB_PROVIDER: 'zhipu',
                    AI_MIND_ZHIPU_API_KEY: 'zhipu-key',
                    AI_MIND_ZHIPU_SEARCH_ENGINE: 'search_std',
                    TAVILY_API_KEY: 'tavily-key',
                },
            })
        ).toBeInstanceOf(ZhipuWebProvider)
    })

    it('非法 selector、非 Search-Std engine 或所选 key 缺失时 fail closed', () => {
        expect(createConfiguredWebProvider({ env: { AI_MIND_WEB_PROVIDER: 'other', TAVILY_API_KEY: 'tavily-key' } })).toBeNull()
        expect(
            createConfiguredWebProvider({
                env: { AI_MIND_WEB_PROVIDER: 'zhipu', AI_MIND_ZHIPU_API_KEY: 'zhipu-key', AI_MIND_ZHIPU_SEARCH_ENGINE: 'search_pro' },
            })
        ).toBeNull()
        expect(createConfiguredWebProvider({ env: { AI_MIND_WEB_PROVIDER: 'zhipu', TAVILY_API_KEY: 'tavily-key' } })).toBeNull()
    })

    it('始终把两类 provider key 作为 outbound known secret', () => {
        expect(
            resolveOutboundKnownSecrets({
                AI_MIND_ZHIPU_API_KEY: 'zhipu-key',
                TAVILY_API_KEY: 'tavily-key',
            })
        ).toEqual(expect.arrayContaining(['tavily-key', 'zhipu-key']))
    })
})
