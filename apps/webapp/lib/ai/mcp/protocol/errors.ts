export type MCPHostErrorCode = 'CONNECT_FAILED' | 'LIST_FAILED' | 'NOT_CONNECTED' | 'REQUEST_FAILED' | 'SERVER_NOT_FOUND' | 'TIMEOUT'

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

export function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }

    return '未知 MCP 错误'
}
