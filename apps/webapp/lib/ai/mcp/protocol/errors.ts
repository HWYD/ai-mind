export type MCPHostErrorCode =
    | 'CONNECT_FAILED'
    | 'EXECUTION_FAILED'
    | 'FORBIDDEN'
    | 'LIST_FAILED'
    | 'NOT_FOUND'
    | 'NOT_CONNECTED'
    | 'REQUEST_FAILED'
    | 'SERVER_NOT_FOUND'
    | 'TIMEOUT'
    | 'UNAUTHORIZED'
    | 'UNSUPPORTED_TRANSPORT'

export interface MCPHostErrorOptions {
    cause?: unknown
    retryAfterMs?: number
    retryLimit?: 1 | 2
    retryable?: boolean
    status?: number
}

/**
 * MCP Host 统一错误类型。
 * 上层可基于 code 做稳定映射，不必依赖底层 SDK 原始异常文案。
 */
export class MCPHostError extends Error {
    cause?: unknown
    code: MCPHostErrorCode
    retryAfterMs?: number
    retryLimit?: 1 | 2
    retryable?: boolean
    status?: number

    constructor(code: MCPHostErrorCode, message: string, options?: MCPHostErrorOptions) {
        super(message)
        this.name = 'MCPHostError'
        this.code = code
        this.cause = options?.cause
        this.status =
            typeof options?.status === 'number' && Number.isInteger(options.status) && options.status >= 100 && options.status <= 599
                ? options.status
                : undefined
        this.retryAfterMs =
            typeof options?.retryAfterMs === 'number' && Number.isFinite(options.retryAfterMs) && options.retryAfterMs >= 0
                ? Math.floor(options.retryAfterMs)
                : undefined
        this.retryLimit = options?.retryLimit === 1 || options?.retryLimit === 2 ? options.retryLimit : undefined
        this.retryable = typeof options?.retryable === 'boolean' ? options.retryable : undefined
    }
}

/**
 * 把 unknown 错误收敛为可展示文案，避免上层反复写类型守卫。
 */
export function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }

    return '未知 MCP 错误'
}
