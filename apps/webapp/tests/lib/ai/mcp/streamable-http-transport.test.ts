import { describe, expect, it } from 'vitest'

import { resolveBearerToken } from '@/lib/ai/mcp/transport/streamable-http-transport'

const authConfig = {
    type: 'bearer-token' as const,
    token: 'project-assistant-service-dev-token',
    tokenEnv: 'PROJECT_ASSISTANT_SERVICE_MCP_TOKEN',
    requireExplicitTokenInProduction: true,
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
