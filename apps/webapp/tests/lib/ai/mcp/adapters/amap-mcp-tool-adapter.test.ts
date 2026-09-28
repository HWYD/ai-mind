import { describe, expect, it, vi } from 'vitest'

const callToolMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/mcp/client/mcp-client-manager', () => ({
    mcpClientManager: {
        callTool: callToolMock,
    },
}))

import { AMAP_MCP_TOOL_MAPPING, callAmapMcpTool, getAmapMcpToolMapping } from '@/lib/ai/mcp/adapters/amap-mcp-tool-adapter'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import { amapCoordinateSchema } from '@/lib/ai/tools/amap/amap-tool-boundary'

describe('AMap MCP static adapter', () => {
    it('only keeps the nine verified remote tools in the local allowlist', () => {
        expect(Object.keys(AMAP_MCP_TOOL_MAPPING).sort()).toEqual([
            'amap-geocode',
            'amap-poi-detail',
            'amap-poi-nearby',
            'amap-poi-search',
            'amap-reverse-geocode',
            'amap-route-bicycling',
            'amap-route-driving',
            'amap-route-transit',
            'amap-route-walking',
        ])
        expect(getAmapMcpToolMapping('unknown-map-tool')).toBeUndefined()
    })

    it('uses the verified fixed mapping, passes AbortSignal, and drops raw result fields', async () => {
        const controller = new AbortController()
        callToolMock.mockResolvedValueOnce({
            result: {
                content: [
                    {
                        text: JSON.stringify({
                            pois: [
                                {
                                    address: 'private address',
                                    id: 'poi-1',
                                    location: '116.397123,39.908456',
                                    name: 'Public POI',
                                    raw_provider_only: 'must-not-leave-adapter',
                                },
                            ],
                            raw_error_text: 'must-not-leave-adapter',
                        }),
                        type: 'text',
                    },
                ],
            },
        })

        const result = await callAmapMcpTool('amap-poi-search', { keywords: 'museum' }, controller.signal)

        expect(callToolMock).toHaveBeenCalledWith(
            'amap-maps',
            {
                arguments: { keywords: 'museum' },
                name: 'maps_text_search',
            },
            { allowSessionRecovery: false, signal: controller.signal }
        )
        expect(result).toMatchObject({ kind: 'poi-search', poiIds: ['poi-1'] })
        expect(JSON.stringify(result)).not.toContain('raw_provider_only')
        expect(JSON.stringify(result)).not.toContain('raw_error_text')
    })

    it('treats MCP isError and empty content as safe failures', async () => {
        callToolMock.mockResolvedValueOnce({ result: { content: [{ text: 'raw provider error', type: 'text' }], isError: true } })
        await expect(callAmapMcpTool('amap-geocode', { address: 'sample' })).rejects.toThrow('地图服务请求失败。')

        callToolMock.mockResolvedValueOnce({ result: { content: [] } })
        await expect(callAmapMcpTool('amap-geocode', { address: 'sample' })).rejects.toThrow('地图服务没有返回可用结果。')
    })

    it('只把 isError 归类为安全重试信号，不保留原始错误', async () => {
        callToolMock.mockResolvedValueOnce({
            result: {
                content: [
                    {
                        text: JSON.stringify({
                            code: 'TOO_MANY_REQUESTS',
                            raw_provider_error: 'must-not-leave-adapter',
                            retryAfterMs: 2500,
                        }),
                        type: 'text',
                    },
                ],
                isError: true,
            },
        })

        const rateLimitFailure = await callAmapMcpTool('amap-geocode', { address: 'sample' }).catch(error => error)

        expect(rateLimitFailure).toMatchObject({
            code: 'REQUEST_FAILED',
            message: '地图服务请求失败。',
            retryAfterMs: 2500,
            retryable: true,
            status: 429,
        })
        expect(rateLimitFailure.message).not.toContain('must-not-leave-adapter')
        expect(JSON.stringify(rateLimitFailure)).not.toContain('must-not-leave-adapter')

        callToolMock.mockResolvedValueOnce({ result: { content: [{ text: 'opaque provider failure', type: 'text' }], isError: true } })

        const opaqueFailure = await callAmapMcpTool('amap-geocode', { address: 'sample' }).catch(error => error)

        expect(opaqueFailure).toMatchObject({
            code: 'REQUEST_FAILED',
            message: '地图服务请求失败。',
            retryLimit: 1,
            retryable: true,
        })
        expect(opaqueFailure.message).not.toContain('opaque provider failure')

        callToolMock.mockResolvedValueOnce({
            result: { content: [{ text: JSON.stringify({ code: 'DAILY_QUERY_OVER_LIMIT' }), type: 'text' }], isError: true },
        })

        const quotaFailure = await callAmapMcpTool('amap-geocode', { address: 'sample' }).catch(error => error)

        expect(quotaFailure).toMatchObject({ code: 'REQUEST_FAILED', message: '地图服务请求失败。', retryable: false })

        callToolMock.mockResolvedValueOnce({
            result: {
                content: [{ text: JSON.stringify({ code: 'DAILY_QUERY_OVER_LIMIT', status: 429 }), type: 'text' }],
                isError: true,
            },
        })

        const quotaWithStatusFailure = await callAmapMcpTool('amap-geocode', { address: 'sample' }).catch(error => error)

        expect(quotaWithStatusFailure).toMatchObject({
            code: 'REQUEST_FAILED',
            message: '地图服务请求失败。',
            retryable: false,
            status: 429,
        })
    })

    it('保留安全 MCP 失败分类，同时移除上游原始错误文本', async () => {
        callToolMock.mockRejectedValueOnce(new MCPHostError('TIMEOUT', 'upstream raw error'))

        await expect(callAmapMcpTool('amap-geocode', { address: 'sample' })).rejects.toMatchObject({
            code: 'TIMEOUT',
            message: '地图服务请求失败。',
        })
    })

    it('只透传可重试所需的安全状态，不透传 Host cause', async () => {
        callToolMock.mockRejectedValueOnce(
            new MCPHostError('EXECUTION_FAILED', 'https://mcp.amap.com/mcp?key=server-only-key', { status: 429 })
        )

        const failure = await callAmapMcpTool('amap-geocode', { address: 'sample' }).catch(error => error)

        expect(failure).toMatchObject({ code: 'EXECUTION_FAILED', message: '地图服务请求失败。', status: 429 })
        expect(failure.cause).toBeUndefined()
        expect(failure.message).not.toContain('server-only-key')
    })

    it('逆地理编码只投影行政区事实，不带出原始响应字段', async () => {
        callToolMock.mockResolvedValueOnce({
            result: {
                content: [
                    {
                        text: JSON.stringify({
                            city: '示例市',
                            country: '示例国',
                            district: '示例区',
                            province: '示例省',
                            raw_provider_only: 'must-not-leave-adapter',
                        }),
                        type: 'text',
                    },
                ],
            },
        })

        const result = await callAmapMcpTool('amap-reverse-geocode', { location: '116.397123,39.908456' })

        expect(result).toMatchObject({
            cities: ['示例市'],
            facts: [{ city: '示例市', country: '示例国', district: '示例区', province: '示例省' }],
            kind: 'reverse-geocode',
        })
        expect(JSON.stringify(result)).not.toContain('raw_provider_only')
    })

    it('明确空 POI 数组表示查询完成但未找到，并把异常结构保留为安全失败', async () => {
        callToolMock.mockResolvedValueOnce({ result: { content: [{ text: JSON.stringify({ pois: [] }), type: 'text' }] } })

        await expect(callAmapMcpTool('amap-poi-nearby', { keywords: '地铁站', location: '116.397123,39.908456' })).resolves.toMatchObject({
            facts: [],
            kind: 'poi-nearby',
            poiIds: [],
            resultStatus: 'no-result',
        })

        callToolMock.mockResolvedValueOnce({ result: { content: [{ text: JSON.stringify({ unrelated: [] }), type: 'text' }] } })
        await expect(callAmapMcpTool('amap-poi-nearby', { keywords: '地铁站', location: '116.397123,39.908456' })).rejects.toThrow(
            '地图服务没有返回可用结果。'
        )
    })
})

describe('AMap coordinate boundary', () => {
    it('normalizes only GCJ-02 longitude,latitude values to six decimals', () => {
        expect(amapCoordinateSchema.parse('116.3971234,39.9084567')).toBe('116.397123,39.908457')
        expect(amapCoordinateSchema.safeParse('39.908456,116.397123').success).toBe(false)
        expect(amapCoordinateSchema.safeParse('200,39').success).toBe(false)
    })
})
