/**
 * Provider 层脱敏日志 helper。
 * 只记录 provider / code / statusCode / safe metadata，不含 API Key / headers / request config。
 */
export function logProviderError(error: unknown): void {
    const safe: Record<string, unknown> = {}

    if (error instanceof Error) {
        safe.name = error.name

        // 仅提取 safe 状态码，不记录 request config / headers / body
        const coded = error as Error & {
            code?: unknown
            stage?: unknown
            status?: number
            statusCode?: number
            timeoutMs?: unknown
        }
        if (typeof coded.code === 'string') {
            safe.code = coded.code
        }
        if (typeof coded.stage === 'string') {
            safe.stage = coded.stage
        }
        if (typeof coded.status === 'number') {
            safe.status = coded.status
        } else if (typeof coded.statusCode === 'number') {
            safe.status = coded.statusCode
        }
        if (typeof coded.timeoutMs === 'number') {
            safe.timeoutMs = coded.timeoutMs
        }

        // 只记录 error.message 的前 200 个字符作为上下文，
        // 避免日志中泄露完整 response body
        if (error.message && error.message.length > 0) {
            safe.messagePreview = error.message.slice(0, 200)
        }
    }

    // eslint-disable-next-line no-console
    console.error('[provider-error]', JSON.stringify(safe))
}
