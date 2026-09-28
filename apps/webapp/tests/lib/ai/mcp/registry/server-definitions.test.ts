import { describe, expect, it } from 'vitest'

import { getMcpServerDefinition, isAmapMapsMcpAvailable } from '@/lib/ai/mcp/registry/server-definitions'

describe('AMap MCP server definition', () => {
    it('固定使用高德 Streamable HTTP 端点，并且只声明 server-side 查询 Key', () => {
        expect(getMcpServerDefinition('amap-maps')).toMatchObject({
            auth: {
                keyEnv: 'AI_MIND_AMAP_MCP_KEY',
                queryParamName: 'key',
                requireExplicitKeyInProduction: true,
                type: 'query-key',
            },
            baseUrl: 'https://mcp.amap.com/mcp',
            location: 'remote',
            serverId: 'amap-maps',
            timeoutMs: 20_000,
            transport: 'streamable-http',
        })
    })

    it('Key 缺失时不将高德能力视为可用', () => {
        expect(isAmapMapsMcpAvailable({})).toBe(false)
        expect(isAmapMapsMcpAvailable({ AI_MIND_AMAP_MCP_KEY: 'server-only-key' })).toBe(true)
    })
})
