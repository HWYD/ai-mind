import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { MCPBearerTokenAuthConfig, MCPQueryKeyAuthConfig, MCPStreamableHttpServerDefinition } from '@/lib/ai/mcp/protocol/types'

/**
 * 解析远程 MCP 的 Bearer Token。
 * 优先读取 tokenEnv，显式 token 只作为开发态 fallback。
 * 标记 requireExplicitTokenInProduction 后，生产运行时必须提供非默认值。
 */
export function resolveBearerToken(authConfig: MCPBearerTokenAuthConfig, env: Record<string, string | undefined> = process.env) {
    const fallbackToken = authConfig.token?.trim()
    const explicitToken = authConfig.tokenEnv?.trim() ? env[authConfig.tokenEnv]?.trim() : undefined

    if (
        authConfig.requireExplicitTokenInProduction &&
        env.NODE_ENV === 'production' &&
        (!explicitToken || explicitToken === fallbackToken)
    ) {
        throw new Error('Remote MCP bearer token must be configured explicitly in production.')
    }

    return explicitToken || fallbackToken
}

/**
 * 仅从服务端进程环境读取远程 MCP 的查询 Key。
 * 调用方不得把 Key 传入模型上下文、请求参数或公开事件。
 */
export function resolveMCPKey(authConfig: MCPQueryKeyAuthConfig, env: Record<string, string | undefined> = process.env) {
    const key = env[authConfig.keyEnv]?.trim()

    if (key) {
        return key
    }

    if (authConfig.requireExplicitKeyInProduction && env.NODE_ENV === 'production') {
        throw new Error('Remote MCP key must be configured explicitly in production.')
    }

    throw new Error('Remote MCP key must be configured.')
}

/**
 * 在 transport 边界添加查询 Key，避免业务层持有带 Key 的 URL。
 */
export function createKeyQueryServerUrl(baseUrl: string, authConfig: MCPQueryKeyAuthConfig, key: string) {
    const url = new URL(baseUrl)
    url.searchParams.set(authConfig.queryParamName?.trim() || 'key', key)

    return url
}

/**
 * 统一拼装 streamable-http 请求头：
 * 1. 先继承 serverDefinition.headers（便于后续按 server 做差异化配置）
 * 2. 再按 auth 配置注入 Bearer Token（如果可用）
 */
function createRequestHeaders(serverDefinition: MCPStreamableHttpServerDefinition) {
    const requestHeaders: Record<string, string> = {
        ...(serverDefinition.headers ?? {}),
    }

    if (serverDefinition.auth?.type !== 'bearer-token') {
        return requestHeaders
    }

    const token = resolveBearerToken(serverDefinition.auth)

    if (!token) {
        return requestHeaders
    }

    const headerName = serverDefinition.auth.headerName?.trim() || 'Authorization'
    const tokenValue = token.startsWith('Bearer ') ? token : `Bearer ${token}`

    requestHeaders[headerName] = tokenValue

    return requestHeaders
}

/**
 * 把远程 streamable-http server definition 转成官方 SDK transport。
 * 这里不做业务层重试与错误映射，只负责 transport 构建。
 */
export function createStreamableHttpClientTransport(serverDefinition: MCPStreamableHttpServerDefinition) {
    const serverUrl =
        serverDefinition.auth?.type === 'query-key'
            ? createKeyQueryServerUrl(serverDefinition.baseUrl, serverDefinition.auth, resolveMCPKey(serverDefinition.auth))
            : new URL(serverDefinition.baseUrl)

    return new StreamableHTTPClientTransport(serverUrl, {
        requestInit: {
            headers: createRequestHeaders(serverDefinition),
        },
    })
}
