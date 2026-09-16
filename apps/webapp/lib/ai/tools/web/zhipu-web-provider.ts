import { z } from 'zod'

import { assertOutboundDataAllowed } from '@/lib/ai/tools/web/outbound-secret-guard'
import { canonicalizePublicWebUrl } from '@/lib/ai/tools/web/web-access-policy'
import { type ReadUrlResult, type WebProvider, WebProviderError, type WebSearchResult } from '@/lib/ai/tools/web/web-provider'
import type { ZhipuWebProviderConfig } from '@/lib/ai/tools/web/web-provider-config'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const zhipuSearchResponseSchema = z.object({
    search_result: z.array(
        z.object({
            content: z.string().optional(),
            link: z.string(),
            title: z.string().optional(),
        })
    ),
})

const zhipuReaderResponseSchema = z.object({
    reader_result: z.object({
        content: z.string(),
        title: z.string().optional(),
        url: z.string().optional(),
    }),
})

export class ZhipuWebProvider implements WebProvider {
    private readonly config: ZhipuWebProviderConfig
    private readonly fetch: FetchLike

    constructor(options: { apiKey: string; fetch?: FetchLike; knownSecrets?: string[] }) {
        this.config = {
            apiKey: options.apiKey,
            engine: 'search_std',
            knownSecrets: options.knownSecrets ?? [options.apiKey],
            readerEndpoint: 'https://open.bigmodel.cn/api/paas/v4/reader',
            searchEndpoint: 'https://open.bigmodel.cn/api/paas/v4/web_search',
        }
        this.fetch = options.fetch ?? globalThis.fetch
    }

    async search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchResult> {
        assertOutboundDataAllowed(input.query, { knownSecrets: this.config.knownSecrets })
        const response = await this.request(
            this.config.searchEndpoint,
            {
                content_size: 'medium',
                count: 5,
                search_engine: this.config.engine,
                search_intent: false,
                search_query: input.query,
            },
            input.signal
        )
        const parsed = zhipuSearchResponseSchema.safeParse(response)
        if (!parsed.success) throw invalidResponseError()

        const results: WebSearchResult['results'] = []
        const seenUrls = new Set<string>()
        for (const result of parsed.data.search_result) {
            let url: string
            try {
                url = canonicalizePublicWebUrl(result.link, { knownSecrets: this.config.knownSecrets })
            } catch {
                continue
            }
            if (seenUrls.has(url)) continue

            seenUrls.add(url)
            results.push({
                snippet: normalizeText(result.content ?? '', 500),
                title: normalizeText(result.title ?? new URL(url).hostname, 300),
                url,
            })
            if (results.length === 5) break
        }

        return {
            query: input.query,
            results,
            truncated: parsed.data.search_result.length > results.length,
        }
    }

    async read(input: { url: string; signal?: AbortSignal }): Promise<ReadUrlResult> {
        const requestedUrl = canonicalizePublicWebUrl(input.url, { knownSecrets: this.config.knownSecrets })
        const response = await this.request(
            this.config.readerEndpoint,
            {
                keep_img_data_url: false,
                retain_images: false,
                return_format: 'markdown',
                timeout: 15,
                url: requestedUrl,
            },
            input.signal
        )
        const parsed = zhipuReaderResponseSchema.safeParse(response)
        if (!parsed.success) throw invalidResponseError()

        const normalizedMarkdown = parsed.data.reader_result.content.replace(/\r\n?/g, '\n').trim()
        let providerReportedUrl: string | undefined
        if (parsed.data.reader_result.url) {
            try {
                providerReportedUrl = canonicalizePublicWebUrl(parsed.data.reader_result.url, { knownSecrets: this.config.knownSecrets })
            } catch {
                providerReportedUrl = undefined
            }
        }

        return {
            markdown: normalizedMarkdown.slice(0, 12_000),
            ...(providerReportedUrl ? { providerReportedUrl } : {}),
            requestedUrl,
            ...(parsed.data.reader_result.title ? { title: normalizeText(parsed.data.reader_result.title, 300) } : {}),
            truncated: normalizedMarkdown.length > 12_000,
        }
    }

    private async request(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        let response: Response
        try {
            response = await this.fetch(endpoint, {
                body: JSON.stringify(body),
                headers: {
                    Authorization: `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
                method: 'POST',
                signal,
            })
        } catch (error) {
            throw new WebProviderError('WEB_CONNECTION_ERROR', '网页服务连接失败。', {
                cause: error,
                provider: 'zhipu',
                retryable: true,
            })
        }

        if (!response.ok) {
            throw new WebProviderError('WEB_HTTP_ERROR', '网页服务暂时不可用。', {
                provider: 'zhipu',
                retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
                retryable: response.status === 429 || response.status >= 500,
                status: response.status,
            })
        }

        try {
            return await response.json()
        } catch (error) {
            throw new WebProviderError('WEB_INVALID_RESPONSE', '网页服务返回了无效响应。', {
                cause: error,
                provider: 'zhipu',
                retryable: false,
            })
        }
    }
}

export function createZhipuWebProvider(options: { config: ZhipuWebProviderConfig; fetch?: FetchLike }): ZhipuWebProvider {
    return new ZhipuWebProvider({
        apiKey: options.config.apiKey,
        fetch: options.fetch,
        knownSecrets: options.config.knownSecrets,
    })
}

function invalidResponseError(): WebProviderError {
    return new WebProviderError('WEB_INVALID_RESPONSE', '网页服务返回了无效响应。', { provider: 'zhipu', retryable: false })
}

function normalizeText(value: string, maximumChars: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, maximumChars)
}

function parseRetryAfterMs(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value.trim())) return undefined

    const milliseconds = Number(value) * 1000
    return milliseconds >= 1000 && milliseconds <= 10_000 ? milliseconds : undefined
}
