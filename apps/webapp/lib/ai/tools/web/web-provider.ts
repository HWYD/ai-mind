export type WebSearchResult = {
    query: string
    results: Array<{
        snippet: string
        title: string
        url: string
    }>
    truncated: boolean
}

export type ReadUrlResult = {
    markdown: string
    providerReportedUrl?: string
    requestedUrl: string
    title?: string
    truncated: boolean
}

export type WebProviderKind = 'tavily' | 'zhipu'

export type WebProviderErrorCode = 'WEB_CONNECTION_ERROR' | 'WEB_HTTP_ERROR' | 'WEB_INVALID_RESPONSE'

export class WebProviderError extends Error {
    readonly code: WebProviderErrorCode
    readonly provider: WebProviderKind
    readonly retryable: boolean
    readonly retryAfterMs?: number
    readonly status?: number
    readonly cause?: unknown

    constructor(
        code: WebProviderErrorCode,
        message: string,
        options: { cause?: unknown; provider: WebProviderKind; retryAfterMs?: number; retryable: boolean; status?: number }
    ) {
        super(message)
        this.name = 'WebProviderError'
        this.code = code
        this.provider = options.provider
        this.retryable = options.retryable
        this.retryAfterMs = options.retryAfterMs
        this.status = options.status
        this.cause = options.cause
    }
}

export interface WebProvider {
    search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchResult>
    read(input: { url: string; signal?: AbortSignal }): Promise<ReadUrlResult>
}
