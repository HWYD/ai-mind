import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MCPServerDefinition } from '@/lib/ai/mcp/protocol/types'

interface DeferredCall {
    promise: Promise<unknown>
    reject: (reason?: unknown) => void
    resolve: (value: unknown) => void
}

function createDeferredCall(): DeferredCall {
    let reject!: (reason?: unknown) => void
    let resolve!: (value: unknown) => void
    const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })

    return { promise, reject, resolve }
}

const mocks = vi.hoisted(() => ({
    callTool: vi.fn(),
    close: vi.fn(),
    definitions: new Map<string, unknown>(),
}))

vi.mock('@/lib/ai/mcp/registry/mcp-server-registry', () => ({
    mcpServerRegistry: {
        get: (serverId: string) => mocks.definitions.get(serverId),
    },
}))

vi.mock('@/lib/ai/mcp/client/mcp-client', () => ({
    MCPClient: class MCPClientMock {
        callTool = mocks.callTool
        close = mocks.close
    },
}))

import { MCPClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'

const amapDefinition = {
    baseUrl: 'https://mcp.example.test',
    capabilities: { prompts: false, resources: false, tools: true },
    displayName: '地图 MCP',
    location: 'remote',
    providerKind: 'mcp',
    serverId: 'amap-maps',
    toolCallBatchPolicy: {
        cooldownMs: 800,
        maxBatchSize: 3,
    },
    transport: 'streamable-http',
} as MCPServerDefinition & { toolCallBatchPolicy: { cooldownMs: number; maxBatchSize: number } }

const weatherDefinition: MCPServerDefinition = {
    args: [],
    capabilities: { prompts: false, resources: false, tools: true },
    command: 'node',
    cwd: process.cwd(),
    displayName: '天气 MCP',
    location: 'local',
    providerKind: 'mcp',
    serverId: 'weather-server',
    transport: 'stdio',
}

async function flushScheduledWork() {
    await Promise.resolve()
    await Promise.resolve()
}

describe('MCPClientManager tool call batching', () => {
    beforeEach(() => {
        mocks.callTool.mockReset()
        mocks.close.mockReset()
        mocks.close.mockResolvedValue(undefined)
        mocks.definitions.clear()
        mocks.definitions.set('amap-maps', amapDefinition)
        mocks.definitions.set('weather-server', weatherDefinition)
        vi.useFakeTimers()
    })

    it('只为声明策略的 server 按三条一批、整批结束后冷却 800ms', async () => {
        const deferredCalls: DeferredCall[] = []
        mocks.callTool.mockImplementation(() => {
            const deferredCall = createDeferredCall()
            deferredCalls.push(deferredCall)
            return deferredCall.promise
        })
        const manager = new MCPClientManager()
        const requests = Array.from({ length: 7 }, () => manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }))

        await flushScheduledWork()
        expect(mocks.callTool).toHaveBeenCalledTimes(3)

        deferredCalls.splice(0, 3).forEach(call => call.resolve({ ok: true }))
        await flushScheduledWork()
        await vi.advanceTimersByTimeAsync(799)
        expect(mocks.callTool).toHaveBeenCalledTimes(3)

        await vi.advanceTimersByTimeAsync(1)
        expect(mocks.callTool).toHaveBeenCalledTimes(6)

        deferredCalls.splice(0, 3).forEach(call => call.resolve({ ok: true }))
        await flushScheduledWork()
        await vi.advanceTimersByTimeAsync(800)
        expect(mocks.callTool).toHaveBeenCalledTimes(7)

        deferredCalls[0]!.resolve({ ok: true })
        await expect(Promise.all(requests)).resolves.toHaveLength(7)
    })

    it('不为未声明策略的 server 改变原有立即转发行为', async () => {
        mocks.callTool.mockResolvedValue({ ok: true })
        const manager = new MCPClientManager()

        await expect(manager.callTool('weather-server', { arguments: {}, name: 'current-weather' })).resolves.toEqual({ ok: true })

        expect(mocks.callTool).toHaveBeenCalledTimes(1)
    })

    it('不同 server 不互相阻塞，同批失败也会在冷却后放行下一批', async () => {
        const deferredCalls: DeferredCall[] = []
        const failure = new Error('provider failure')
        mocks.callTool.mockImplementation((params: { name: string }) => {
            if (params.name === 'current-weather') {
                return Promise.resolve({ weather: 'sunny' })
            }

            const deferredCall = createDeferredCall()
            deferredCalls.push(deferredCall)
            return deferredCall.promise
        })
        const manager = new MCPClientManager()
        const mapRequests = Array.from({ length: 4 }, () => manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }))

        await flushScheduledWork()
        expect(mocks.callTool).toHaveBeenCalledTimes(3)
        await expect(manager.callTool('weather-server', { arguments: {}, name: 'current-weather' })).resolves.toEqual({ weather: 'sunny' })
        expect(mocks.callTool).toHaveBeenCalledTimes(4)

        deferredCalls[0]!.reject(failure)
        deferredCalls[1]!.resolve({ ok: true })
        deferredCalls[2]!.resolve({ ok: true })
        await expect(mapRequests[0]).rejects.toBe(failure)
        await flushScheduledWork()
        await vi.advanceTimersByTimeAsync(800)
        expect(mocks.callTool).toHaveBeenCalledTimes(5)

        deferredCalls[3]!.resolve({ ok: true })
        await expect(Promise.allSettled(mapRequests.slice(1))).resolves.toHaveLength(3)
    })

    it('取消仍在队列中的调用时不向 provider 外发', async () => {
        const deferredCalls: DeferredCall[] = []
        mocks.callTool.mockImplementation(() => {
            const deferredCall = createDeferredCall()
            deferredCalls.push(deferredCall)
            return deferredCall.promise
        })
        const manager = new MCPClientManager()
        const controller = new AbortController()
        const activeRequests = Array.from({ length: 3 }, () => manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }))
        const queuedRequest = manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }, { signal: controller.signal })

        await flushScheduledWork()
        expect(mocks.callTool).toHaveBeenCalledTimes(3)

        const abortReason = new DOMException('cancelled', 'AbortError')
        controller.abort(abortReason)
        await expect(queuedRequest).rejects.toBe(abortReason)

        deferredCalls.splice(0, 3).forEach(call => call.resolve({ ok: true }))
        await flushScheduledWork()
        await vi.advanceTimersByTimeAsync(800)
        expect(mocks.callTool).toHaveBeenCalledTimes(3)
        await expect(Promise.all(activeRequests)).resolves.toHaveLength(3)
    })

    it('close 会拒绝未外发的队列项，且不会让旧队列在之后启动', async () => {
        mocks.callTool.mockImplementation(() => createDeferredCall().promise)
        const manager = new MCPClientManager()
        const activeRequests = Array.from({ length: 3 }, () => manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }))
        const queuedRequest = manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' })

        await flushScheduledWork()
        expect(mocks.callTool).toHaveBeenCalledTimes(3)

        await manager.close('amap-maps')
        await expect(queuedRequest).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
        await vi.advanceTimersByTimeAsync(1_000)
        expect(mocks.callTool).toHaveBeenCalledTimes(3)

        void activeRequests
    })

    it('closeAll 也会拒绝未外发的队列项', async () => {
        mocks.callTool.mockImplementation(() => createDeferredCall().promise)
        const manager = new MCPClientManager()
        const activeRequests = Array.from({ length: 3 }, () => manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' }))
        const queuedRequest = manager.callTool('amap-maps', { arguments: {}, name: 'poi-detail' })

        await flushScheduledWork()
        await manager.closeAll()

        await expect(queuedRequest).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
        expect(mocks.close).toHaveBeenCalledTimes(1)
        void activeRequests
    })

    it('保持 provider 的失败对象，不在 manager 层重写分类或文案', async () => {
        const failure = new Error('provider failure')
        mocks.callTool.mockRejectedValue(failure)
        const manager = new MCPClientManager()

        await expect(manager.callTool('weather-server', { arguments: {}, name: 'current-weather' })).rejects.toBe(failure)
    })
})
