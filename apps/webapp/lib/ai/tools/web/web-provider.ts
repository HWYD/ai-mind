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

export interface WebProvider {
    search(input: { query: string; signal?: AbortSignal }): Promise<WebSearchResult>
    read(input: { url: string; signal?: AbortSignal }): Promise<ReadUrlResult>
}
