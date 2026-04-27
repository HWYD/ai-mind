import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import type { MCPBearerTokenAuthConfig, MCPStreamableHttpServerDefinition } from '@/lib/ai/mcp/protocol/types'

/**
 * 解析远程 MCP 的 Bearer Token。
 * 优先级：显式 token > tokenEnv 对应的环境变量；两者都没有时返回 undefined，让服务端按未认证处理。
 */
function resolveBearerToken(authConfig: MCPBearerTokenAuthConfig) {
    if (authConfig.token?.trim()) {
        return authConfig.token.trim()
    }

    if (authConfig.tokenEnv?.trim()) {
        return process.env[authConfig.tokenEnv]?.trim()
    }

    return undefined
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
    return new StreamableHTTPClientTransport(new URL(serverDefinition.baseUrl), {
        requestInit: {
            headers: createRequestHeaders(serverDefinition),
        },
    })
}
