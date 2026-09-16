import { describe, expect, it, vi } from 'vitest'

import { WebProviderError } from '@/lib/ai/tools/web/web-provider'
import { webSearchToolSchema } from '@/lib/ai/tools/web/web-search-tool'
import { ZhipuWebProvider } from '@/lib/ai/tools/web/zhipu-web-provider'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        ...init,
    })
}

describe('zhipu-web-provider', () => {
    it('将统一搜索参数限制为 Search-Std 支持的 70 字符', () => {
        expect(webSearchToolSchema.safeParse({ query: 'a'.repeat(70) }).success).toBe(true)
        expect(webSearchToolSchema.safeParse({ query: 'a'.repeat(71) }).success).toBe(false)
    })

    it('Search 固定发送 Search-Std 最小 payload，并归一化最多五条安全来源', async () => {
        const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
            jsonResponse({
                search_result: [
                    ...Array.from({ length: 6 }, (_, index) => ({
                        content: `snippet ${index}`,
                        link: `https://example.com/${index}#fragment`,
                        title: `Result ${index}`,
                    })),
                    { content: 'duplicate', link: 'https://example.com/0', title: 'Duplicate' },
                    { content: 'private', link: 'http://127.0.0.1/admin', title: 'Private' },
                ],
            })
        )
        const provider = new ZhipuWebProvider({ apiKey: 'provider-key', fetch })

        const result = await provider.search({ query: 'current AI news' })

        const [url, request] = fetch.mock.calls[0]!
        expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/web_search')
        expect(request?.method).toBe('POST')
        expect(JSON.parse(String(request?.body))).toEqual({
            content_size: 'medium',
            count: 5,
            search_engine: 'search_std',
            search_intent: false,
            search_query: 'current AI news',
        })
        expect(result.results).toHaveLength(5)
        expect(result.results[0]).toEqual({ snippet: 'snippet 0', title: 'Result 0', url: 'https://example.com/0' })
    })

    it('Reader 只提交一个已授权 URL，限制 Markdown 并复验 provider-reported URL', async () => {
        const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
            jsonResponse({
                reader_result: {
                    content: `\r\n${'a'.repeat(12_500)}\r\n`,
                    title: 'Provider title',
                    url: 'http://localhost/redirected',
                },
            })
        )
        const provider = new ZhipuWebProvider({ apiKey: 'provider-key', fetch })

        const result = await provider.read({ url: 'https://example.com/docs' })

        const [url, request] = fetch.mock.calls[0]!
        expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/reader')
        expect(JSON.parse(String(request?.body))).toEqual({
            keep_img_data_url: false,
            retain_images: false,
            return_format: 'markdown',
            timeout: 15,
            url: 'https://example.com/docs',
        })
        expect(result.requestedUrl).toBe('https://example.com/docs')
        expect(result.providerReportedUrl).toBeUndefined()
        expect(result.markdown).toHaveLength(12_000)
        expect(result.truncated).toBe(true)
    })

    it('把连接错误映射为 provider-neutral typed error，供既有 Tool Runtime 分类', async () => {
        const provider = new ZhipuWebProvider({
            apiKey: 'provider-key',
            fetch: vi.fn(async () => {
                throw new Error('network down')
            }),
        })

        await expect(provider.search({ query: 'current news' })).rejects.toMatchObject({
            code: 'WEB_CONNECTION_ERROR',
            provider: 'zhipu',
            retryable: true,
        } satisfies Partial<WebProviderError>)
    })
})
