import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdkMocks = vi.hoisted(() => ({
    clients: [] as Array<{
        callTool: ReturnType<typeof vi.fn>
        connect: ReturnType<typeof vi.fn>
    }>,
    transports: [] as Array<{ close: ReturnType<typeof vi.fn>; onclose?: () => void; onerror?: (error: Error) => void }>,
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class ClientMock {
        callTool = vi.fn()
        connect = vi.fn().mockResolvedValue(undefined)
        getInstructions = vi.fn()
        getServerCapabilities = vi.fn()
        getServerVersion = vi.fn()
        onerror?: (error: Error) => void

        constructor() {
            sdkMocks.clients.push(this)
        }
    },
}))

vi.mock('@/lib/ai/mcp/transport/streamable-http-transport', () => ({
    createStreamableHttpClientTransport: vi.fn(() => {
        const transport = { close: vi.fn().mockResolvedValue(undefined) }
        sdkMocks.transports.push(transport)
        return transport
    }),
}))

vi.mock('@/lib/ai/mcp/transport/stdio-transport', () => ({
    createStdioClientTransport: vi.fn(),
}))

import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { MCPClient } from '@/lib/ai/mcp/client/mcp-client'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'

describe('MCPClient cancellation recovery', () => {
    beforeEach(() => {
        sdkMocks.clients.length = 0
        sdkMocks.transports.length = 0
    })

    it('session 失效响应到达时 signal 已取消，不重建连接或隐藏重试', async () => {
        const controller = new AbortController()
        const client = new MCPClient({
            baseUrl: 'https://mcp.example.test',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: 'Remote MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
            transport: 'streamable-http',
        })
        sdkMocks.clients[0]!.callTool.mockImplementationOnce(async () => {
            controller.abort(new DOMException('cancelled', 'AbortError'))
            throw new Error('session not found')
        })

        await expect(client.callTool({ arguments: {}, name: 'remote-tool' }, { signal: controller.signal })).rejects.toMatchObject({
            code: 'EXECUTION_FAILED',
        })

        expect(sdkMocks.clients).toHaveLength(1)
        expect(sdkMocks.clients[0]!.callTool).toHaveBeenCalledTimes(1)
        expect(sdkMocks.transports[0]!.close).not.toHaveBeenCalled()
    })

    it('调用方关闭 session recovery 时不重建连接或隐藏重试', async () => {
        const client = new MCPClient({
            baseUrl: 'https://mcp.example.test',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: 'Remote MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
            transport: 'streamable-http',
        })
        sdkMocks.clients[0]!.callTool.mockRejectedValueOnce(new Error('session not found'))

        await expect(client.callTool({ arguments: {}, name: 'remote-tool' }, { allowSessionRecovery: false })).rejects.toMatchObject({
            code: 'NOT_FOUND',
        })

        expect(sdkMocks.clients).toHaveLength(1)
        expect(sdkMocks.clients[0]!.callTool).toHaveBeenCalledTimes(1)
        expect(sdkMocks.transports[0]!.close).not.toHaveBeenCalled()
    })

    it('MCP request timeout 会主动 abort SDK request，并禁止迟到结果进入 recovery', async () => {
        const client = new MCPClient({
            baseUrl: 'https://mcp.example.test',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: 'Remote MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
            timeoutMs: 10,
            transport: 'streamable-http',
        })
        let requestSignal: AbortSignal | undefined
        sdkMocks.clients[0]!.callTool.mockImplementationOnce((_params: unknown, _schema: unknown, options: { signal?: AbortSignal }) => {
            requestSignal = options.signal
            return new Promise(() => undefined)
        })

        await expect(client.callTool({ arguments: {}, name: 'remote-tool' })).rejects.toMatchObject({ code: 'TIMEOUT' })
        expect(requestSignal?.aborted).toBe(true)
        expect(sdkMocks.clients).toHaveLength(1)
        expect(sdkMocks.transports[0]!.close).not.toHaveBeenCalled()
    })

    it('高德 MCP 的底层错误不会把含 Key URL 写入 Host 错误消息', async () => {
        const client = new MCPClient({
            auth: {
                keyEnv: 'AI_MIND_AMAP_MCP_KEY',
                type: 'query-key',
            },
            baseUrl: 'https://mcp.amap.com/mcp',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: '高德地图 MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'amap-maps',
            transport: 'streamable-http',
        })
        sdkMocks.clients[0]!.callTool.mockRejectedValueOnce(new Error('request failed: https://mcp.amap.com/mcp?key=server-only-key'))

        const failure = await client
            .callTool({ arguments: {}, name: 'remote-map-tool' }, { allowSessionRecovery: false })
            .catch(error => error)

        expect(failure).toMatchObject({
            code: 'EXECUTION_FAILED',
            message: '高德地图 MCP Tool 调用失败。',
        })
        expect(failure.message).not.toContain('server-only-key')
    })

    it('高德 MCP 在保留安全 HTTP 状态时仍不暴露底层错误文本', async () => {
        const client = new MCPClient({
            auth: {
                keyEnv: 'AI_MIND_AMAP_MCP_KEY',
                type: 'query-key',
            },
            baseUrl: 'https://mcp.amap.com/mcp',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: '高德地图 MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'amap-maps',
            transport: 'streamable-http',
        })
        sdkMocks.clients[0]!.callTool.mockRejectedValueOnce(new StreamableHTTPError(429, 'https://mcp.amap.com/mcp?key=server-only-key'))

        const failure = await client
            .callTool({ arguments: {}, name: 'remote-map-tool' }, { allowSessionRecovery: false })
            .catch(error => error)

        expect(failure).toMatchObject({
            code: 'EXECUTION_FAILED',
            message: '高德地图 MCP Tool 调用失败。',
            status: 429,
        })
        expect(failure.message).not.toContain('server-only-key')
        expect(failure.cause).toBeUndefined()
    })

    it('高德 MCP 即使调用方未传选项也不会进行 session recovery', async () => {
        const client = new MCPClient({
            auth: {
                keyEnv: 'AI_MIND_AMAP_MCP_KEY',
                type: 'query-key',
            },
            baseUrl: 'https://mcp.amap.com/mcp',
            capabilities: { prompts: false, resources: false, tools: true },
            displayName: '高德地图 MCP',
            location: 'remote',
            providerKind: 'mcp',
            serverId: 'amap-maps',
            transport: 'streamable-http',
        })
        sdkMocks.clients[0]!.callTool.mockRejectedValueOnce(new Error('session not found'))

        await expect(client.callTool({ arguments: {}, name: 'remote-map-tool' })).rejects.toMatchObject({ code: 'NOT_FOUND' })

        expect(sdkMocks.clients).toHaveLength(1)
        expect(sdkMocks.clients[0]!.callTool).toHaveBeenCalledTimes(1)
        expect(sdkMocks.transports[0]!.close).not.toHaveBeenCalled()
    })
})
