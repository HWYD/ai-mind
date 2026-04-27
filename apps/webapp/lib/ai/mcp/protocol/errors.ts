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

/**
 * MCP Host 统一错误类型。
 * 上层可基于 code 做稳定映射，不必依赖底层 SDK 原始异常文案。
 */
export class MCPHostError extends Error {
    cause?: unknown
    code: MCPHostErrorCode

    constructor(code: MCPHostErrorCode, message: string, options?: { cause?: unknown }) {
        super(message)
        this.name = 'MCPHostError'
        this.code = code
        this.cause = options?.cause
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
