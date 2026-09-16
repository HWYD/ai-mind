import { describe, expect, it, vi } from 'vitest'

import { createTavilyWebProvider, TavilyWebProvider, WebProviderError } from '@/lib/ai/tools/web/tavily-web-provider'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        ...init,
    })
}

describe('tavily-web-provider', () => {
    it('TAVILY_API_KEY 缺失时不可用且不创建必然失败的 provider', () => {
        expect(createTavilyWebProvider({ env: {} })).toBeNull()
    })

    it('Search 只发送固定最小 payload，并返回最多五条安全去重结果', async () => {
        const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
            jsonResponse({
                results: [
                    ...Array.from({ length: 6 }, (_, index) => ({
                        content: `snippet ${index}`,
                        title: `Result ${index}`,
                        url: `https://example.com/${index}#fragment`,
                    })),
                    { content: 'duplicate', title: 'Duplicate', url: 'https://example.com/0' },
                    { content: 'private', title: 'Private', url: 'http://127.0.0.1/admin' },
                    { content: 'signed', title: 'Signed', url: 'https://files.example.com/a?X-Amz-Signature=secret' },
                ],
            })
        )
        const provider = new TavilyWebProvider({ apiKey: 'provider-key', fetch })

        const result = await provider.search({ query: 'LangChain createAgent' })

        expect(fetch).toHaveBeenCalledTimes(1)
        const [url, request] = fetch.mock.calls[0]!
        expect(url).toBe('https://api.tavily.com/search')
        expect(request?.method).toBe('POST')
        expect(JSON.parse(String(request?.body))).toEqual({
            include_answer: false,
            include_raw_content: false,
            max_results: 5,
            query: 'LangChain createAgent',
            search_depth: 'basic',
        })
        expect(result.results).toHaveLength(5)
        expect(result.results[0]).toEqual({ snippet: 'snippet 0', title: 'Result 0', url: 'https://example.com/0' })
    })

    it('Extract 只提交一个 URL、限制 Markdown 为 12000 chars，并复验 provider-reported URL', async () => {
        const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
            jsonResponse({
                results: [
                    {
                        raw_content: `\r\n${'a'.repeat(12_500)}\r\n`,
                        title: 'Provider title',
                        url: 'http://localhost/redirected',
                    },
                ],
            })
        )
        const provider = new TavilyWebProvider({ apiKey: 'provider-key', fetch })

        const result = await provider.read({ url: 'https://example.com/docs' })

        const [url, request] = fetch.mock.calls[0]!
        expect(url).toBe('https://api.tavily.com/extract')
        expect(JSON.parse(String(request?.body))).toEqual({
            extract_depth: 'basic',
            format: 'markdown',
            urls: ['https://example.com/docs'],
        })
        expect(result.requestedUrl).toBe('https://example.com/docs')
        expect(result.providerReportedUrl).toBeUndefined()
        expect(result.markdown).toHaveLength(12_000)
        expect(result.truncated).toBe(true)
    })

    it('保留通过复验的 provider-reported URL', async () => {
        const provider = new TavilyWebProvider({
            apiKey: 'provider-key',
            fetch: vi.fn(async () =>
                jsonResponse({ results: [{ raw_content: 'content', url: 'https://docs.example.com/final#fragment' }] })
            ),
        })

        await expect(provider.read({ url: 'https://example.com/start' })).resolves.toMatchObject({
            providerReportedUrl: 'https://docs.example.com/final',
        })
    })

    it('把 HTTP transient failure 映射为 Tool Runtime 可识别的 typed error，并尊重 Retry-After', async () => {
        const provider = new TavilyWebProvider({
            apiKey: 'provider-key',
            fetch: vi.fn(async () => new Response('busy', { headers: { 'Retry-After': '2' }, status: 429 })),
        })

        await expect(provider.search({ query: 'current news' })).rejects.toMatchObject({
            code: 'TAVILY_HTTP_ERROR',
            retryAfterMs: 2000,
            status: 429,
        })
    })

    it('把无效 provider response 收口为不可重试 typed error', async () => {
        const provider = new TavilyWebProvider({
            apiKey: 'provider-key',
            fetch: vi.fn(async () => jsonResponse({ results: 'invalid' })),
        })

        await expect(provider.search({ query: 'current news' })).rejects.toBeInstanceOf(WebProviderError)
        await expect(provider.search({ query: 'current news' })).rejects.toMatchObject({
            code: 'TAVILY_INVALID_RESPONSE',
            retryable: false,
        })
    })
})
