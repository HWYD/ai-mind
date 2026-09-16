import { describe, expect, it, vi } from 'vitest'

const { callToolMock, listToolsMock } = vi.hoisted(() => ({ callToolMock: vi.fn(), listToolsMock: vi.fn() }))

vi.mock('@/lib/ai/mcp/client/mcp-client-manager', () => ({
    mcpClientManager: {
        callTool: callToolMock,
        listTools: listToolsMock,
    },
}))

import { getRemoteMcpToolDefinition } from '@/lib/ai/mcp/adapters/remote-mcp-tool-adapter'

describe('remote MCP tool adapter public boundary', () => {
    it('rejects undeclared dynamic MCP fields and never formats raw arguments/output for public UI', async () => {
        listToolsMock.mockResolvedValueOnce({
            tools: [
                {
                    description: 'dynamic remote tool',
                    inputSchema: {
                        properties: { query: { type: 'string' } },
                        required: ['query'],
                        type: 'object',
                    },
                    name: 'remote-search',
                },
            ],
        })

        const definition = await getRemoteMcpToolDefinition('remote-server' as never, 'remote-search')

        expect(definition).toBeTruthy()
        expect(definition?.schema.safeParse({ query: 'ok', secret: 'should-reject' }).success).toBe(false)
        expect(definition?.formatInput?.({ query: 'secret-token' })).toBe('远程工具')
        expect(definition?.formatPublicOutput?.({ raw: 'private output' })).toBe('工具已完成。')
    })

    it('propagates the Tool Runtime AbortSignal to MCP callTool', async () => {
        listToolsMock.mockResolvedValueOnce({
            tools: [{ inputSchema: { properties: {}, type: 'object' }, name: 'remote-tool' }],
        })
        callToolMock.mockResolvedValueOnce({ result: { content: [{ text: 'ok', type: 'text' }] } })
        const definition = await getRemoteMcpToolDefinition('remote-server' as never, 'remote-tool')
        const controller = new AbortController()

        await definition?.tool.invoke({}, { signal: controller.signal })

        expect(callToolMock).toHaveBeenCalledWith(
            'remote-server',
            { arguments: {}, name: 'remote-tool' },
            { allowSessionRecovery: false, signal: controller.signal }
        )
    })
})
