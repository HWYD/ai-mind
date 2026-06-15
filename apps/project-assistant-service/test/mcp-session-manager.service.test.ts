import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

import { McpSessionManagerService } from '../src/mcp/mcp-session-manager.service.js'

describe('McpSessionManagerService', () => {
    it('模块销毁时关闭全部 MCP session', async () => {
        const transportClose = mock.fn(async () => undefined)
        const serverClose = mock.fn(async () => undefined)
        const service = new McpSessionManagerService({} as never)
        const sessionMap = (
            service as unknown as {
                sessionMap: Map<
                    string,
                    {
                        createdAt: string
                        server: { close: () => Promise<void> }
                        transport: { close: () => Promise<void>; onclose?: (() => void) | undefined }
                    }
                >
            }
        ).sessionMap

        sessionMap.set('session-1', {
            createdAt: new Date().toISOString(),
            server: { close: serverClose },
            transport: { close: transportClose },
        })

        await service.onModuleDestroy()

        assert.equal(sessionMap.size, 0)
        assert.equal(transportClose.mock.callCount(), 1)
        assert.equal(serverClose.mock.callCount(), 1)
    })
})
