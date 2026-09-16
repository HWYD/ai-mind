import { z } from 'zod'

import { assertOutboundDataAllowed } from '@/lib/ai/tools/web/outbound-secret-guard'
import { canonicalizePublicWebUrl } from '@/lib/ai/tools/web/web-access-policy'
import type { ReadUrlResult, WebProvider, WebSearchResult } from '@/lib/ai/tools/web/web-provider'
import { resolveTavilyWebProviderConfig, type TavilyWebProviderConfig, type WebProviderEnv } from '@/lib/ai/tools/web/web-provider-config'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class WebProviderError extends Error {
    readonly code: 'TAVILY_CONNECTION_ERROR' | 'TAVILY_HTTP_ERROR' | 'TAVILY_INVALID_RESPONSE'
    readonly retryable: boolean
    readonly retryAfterMs?: number
    readonly status?: number
    readonly cause?: unknown

    constructor(
        code: WebProviderError['code'],
        message: string,
        options: { cause?: unknown; retryAfterMs?: number; retryable: boolean; status?: number }
    ) {
        super(message)
        this.name = 'WebProviderError'
        this.code = code
        this.retryable = options.retryable
        this.retryAfterMs = options.retryAfterMs
        this.status = options.status
        this.cause = options.cause
    }
}

const tavilySearchResponseSchema = z.object({
    results: z.array(
        z.object({
            content: z.string().optional(),
            title: z.string().optional(),
            url: z.string(),
        })
    ),
})

const tavilyExtractResponseSchema = z.object({
    results: z.array(
        z.object({
            raw_content: z.string(),
            title: z.string().optional(),
            url: z.string().optional(),
        })
    ),
})

export class TavilyWebProvider implements WebProvider {
    private readonly config: TavilyWebProviderConfig
    private readonly fetch: FetchLike

    constructor(options: { apiKey: string; fetch?: FetchLike; knownSecrets?: string[] }) {
        this.config = {
            apiKey: options.apiKey,
            extractEndpoint: 'https://api.tavily.com/extract',
            knownSecrets: options.knownSecrets ?? [options.apiKey],
            searchEndpoint: 'https://api.tavily.com/search',
        }
        this.fetch = options.fetch ?? globalThis.fetch
    }

    async search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchResult> {
        assertOutboundDataAllowed(input.query, { knownSecrets: this.config.knownSecrets })
        const response = await this.request(
            this.config.searchEndpoint,
            {
                include_answer: false,
                include_raw_content: false,
                max_results: 5,
                query: input.query,
                search_depth: 'basic',
            },
            input.signal
        )
        const parsed = tavilySearchResponseSchema.safeParse(response)
        if (!parsed.success) {
            throw invalidResponseError()
        }

        const results: WebSearchResult['results'] = []
        const seenUrls = new Set<string>()
        for (const result of parsed.data.results) {
            let url: string
            try {
                url = canonicalizePublicWebUrl(result.url, { knownSecrets: this.config.knownSecrets })
            } catch {
                continue
            }
            if (seenUrls.has(url)) {
                continue
            }

            seenUrls.add(url)
            results.push({
                snippet: normalizeText(result.content ?? '', 500),
                title: normalizeText(result.title ?? new URL(url).hostname, 300),
                url,
            })
            if (results.length === 5) {
                break
            }
        }

        return {
            query: input.query,
            results,
            truncated: parsed.data.results.length > results.length,
        }
    }

    async read(input: { url: string; signal?: AbortSignal }): Promise<ReadUrlResult> {
        const requestedUrl = canonicalizePublicWebUrl(input.url, { knownSecrets: this.config.knownSecrets })
        const response = await this.request(
            this.config.extractEndpoint,
            {
                extract_depth: 'basic',
                format: 'markdown',
                urls: [requestedUrl],
            },
            input.signal
        )
        const parsed = tavilyExtractResponseSchema.safeParse(response)
        const firstResult = parsed.success ? parsed.data.results[0] : undefined
        if (!firstResult) {
            throw invalidResponseError()
        }

        const normalizedMarkdown = firstResult.raw_content.replace(/\r\n?/g, '\n').trim()
        let providerReportedUrl: string | undefined
        if (firstResult.url) {
            try {
                providerReportedUrl = canonicalizePublicWebUrl(firstResult.url, { knownSecrets: this.config.knownSecrets })
            } catch {
                providerReportedUrl = undefined
            }
        }

        return {
            markdown: normalizedMarkdown.slice(0, 12_000),
            ...(providerReportedUrl ? { providerReportedUrl } : {}),
            requestedUrl,
            ...(firstResult.title ? { title: normalizeText(firstResult.title, 300) } : {}),
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
            throw new WebProviderError('TAVILY_CONNECTION_ERROR', '网页服务连接失败。', {
                cause: error,
                retryable: true,
            })
        }

        if (!response.ok) {
            throw new WebProviderError('TAVILY_HTTP_ERROR', '网页服务暂时不可用。', {
                retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')),
                retryable: response.status === 429 || response.status >= 500,
                status: response.status,
            })
        }

        try {
            return await response.json()
        } catch (error) {
            throw new WebProviderError('TAVILY_INVALID_RESPONSE', '网页服务返回了无效响应。', {
                cause: error,
                retryable: false,
            })
        }
    }
}

export function createTavilyWebProvider(options: { env?: WebProviderEnv; fetch?: FetchLike } = {}): TavilyWebProvider | null {
    const config = resolveTavilyWebProviderConfig(options.env)
    if (!config) {
        return null
    }

    return new TavilyWebProvider({
        apiKey: config.apiKey,
        fetch: options.fetch,
        knownSecrets: config.knownSecrets,
    })
}

function normalizeText(value: string, maximumChars: number): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, maximumChars)
}

function invalidResponseError(): WebProviderError {
    return new WebProviderError('TAVILY_INVALID_RESPONSE', '网页服务返回了无效响应。', { retryable: false })
}

function parseRetryAfterMs(value: string | null): number | undefined {
    if (!value || !/^\d+$/.test(value.trim())) {
        return undefined
    }

    const milliseconds = Number(value) * 1000
    return milliseconds >= 1000 && milliseconds <= 10_000 ? milliseconds : undefined
}
