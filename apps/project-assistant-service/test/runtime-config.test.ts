import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ProjectAssistantServiceConfigError, resolveProjectAssistantServiceRuntimeConfig } from '../src/runtime-config.js'

describe('resolveProjectAssistantServiceRuntimeConfig', () => {
    it('未配置 Host/Port 时保持本地开发默认值', () => {
        const config = resolveProjectAssistantServiceRuntimeConfig({})

        assert.equal(config.host, '127.0.0.1')
        assert.equal(config.port, 8788)
        assert.equal(config.mcpToken, 'project-assistant-service-dev-token')
    })

    it('生产环境缺少 MCP Token 时 fail closed', () => {
        assert.throws(
            () =>
                resolveProjectAssistantServiceRuntimeConfig({
                    NODE_ENV: 'production',
                }),
            error => error instanceof ProjectAssistantServiceConfigError && error.code === 'production_mcp_token_required'
        )
    })

    it('生产环境仍使用默认开发 Token 时 fail closed', () => {
        assert.throws(
            () =>
                resolveProjectAssistantServiceRuntimeConfig({
                    NODE_ENV: 'production',
                    PROJECT_ASSISTANT_SERVICE_MCP_TOKEN: 'project-assistant-service-dev-token',
                }),
            error => error instanceof ProjectAssistantServiceConfigError && error.code === 'production_mcp_token_required'
        )
    })

    it('生产环境显式配置 Token 时可以正常通过', () => {
        const config = resolveProjectAssistantServiceRuntimeConfig({
            NODE_ENV: 'production',
            PROJECT_ASSISTANT_SERVICE_MCP_TOKEN: 'project-assistant-service-prod-token',
            PROJECT_ASSISTANT_SERVICE_HOST: '0.0.0.0',
            PROJECT_ASSISTANT_SERVICE_PORT: '8788',
        })

        assert.equal(config.host, '0.0.0.0')
        assert.equal(config.port, 8788)
        assert.equal(config.mcpToken, 'project-assistant-service-prod-token')
    })

    it('非法端口配置会明确失败', () => {
        assert.throws(
            () =>
                resolveProjectAssistantServiceRuntimeConfig({
                    PROJECT_ASSISTANT_SERVICE_PORT: 'abc',
                }),
            error => error instanceof ProjectAssistantServiceConfigError && error.code === 'invalid_port'
        )
    })
})
