import { describe, expect, it } from 'vitest'

import { createKeyQueryServerUrl, resolveBearerToken, resolveMCPKey } from '@/lib/ai/mcp/transport/streamable-http-transport'

const authConfig = {
    type: 'bearer-token' as const,
    token: 'project-assistant-service-dev-token',
    tokenEnv: 'PROJECT_ASSISTANT_SERVICE_MCP_TOKEN',
    requireExplicitTokenInProduction: true,
}

const keyAuthConfig = {
    type: 'query-key' as const,
    keyEnv: 'AI_MIND_AMAP_MCP_KEY',
    queryParamName: 'key',
    requireExplicitKeyInProduction: true,
}

describe('resolveBearerToken', () => {
    it('开发态未配置 env 时使用默认 Token', () => {
        expect(resolveBearerToken(authConfig, {})).toBe('project-assistant-service-dev-token')
    })

    it('优先使用运行时 env Token', () => {
        expect(
            resolveBearerToken(authConfig, {
                PROJECT_ASSISTANT_SERVICE_MCP_TOKEN: 'runtime-token',
            })
        ).toBe('runtime-token')
    })

    it('生产环境缺少显式 Token 时 fail closed', () => {
        expect(() => resolveBearerToken(authConfig, { NODE_ENV: 'production' })).toThrow(
            'Remote MCP bearer token must be configured explicitly in production.'
        )
    })

    it('生产环境仍使用默认 Token 时 fail closed', () => {
        expect(() =>
            resolveBearerToken(authConfig, {
                NODE_ENV: 'production',
                PROJECT_ASSISTANT_SERVICE_MCP_TOKEN: 'project-assistant-service-dev-token',
            })
        ).toThrow('Remote MCP bearer token must be configured explicitly in production.')
    })
})

describe('AMap query key', () => {
    it('只从运行时环境读取 Key，并将其作为 URL 查询参数', () => {
        const key = resolveMCPKey(keyAuthConfig, { AI_MIND_AMAP_MCP_KEY: 'local-test-key' })

        expect(createKeyQueryServerUrl('https://mcp.amap.com/mcp', keyAuthConfig, key).toString()).toBe(
            'https://mcp.amap.com/mcp?key=local-test-key'
        )
    })

    it('生产环境缺少 Key 时拒绝创建远程 MCP 连接', () => {
        expect(() => resolveMCPKey(keyAuthConfig, { NODE_ENV: 'production' })).toThrow(
            'Remote MCP key must be configured explicitly in production.'
        )
    })
})
