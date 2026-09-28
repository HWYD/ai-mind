import { describe, expect, it, vi } from 'vitest'

const callAmapMcpToolMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/mcp/adapters/amap-mcp-tool-adapter', () => ({
    callAmapMcpTool: callAmapMcpToolMock,
}))

import { amapPoiDetailToolDefinition, amapPoiNearbyToolDefinition, amapPoiSearchToolDefinition } from '@/lib/ai/tools/amap/amap-poi-tools'

describe('AMap POI tools', () => {
    it('uses strict schemas and safe public projections', () => {
        expect(amapPoiSearchToolDefinition.schema.safeParse({ keywords: 'museum', unexpected: true }).success).toBe(false)
        expect(amapPoiNearbyToolDefinition.schema.safeParse({ keywords: 'museum', location: '116.397123,39.908456' }).success).toBe(true)
        expect(amapPoiDetailToolDefinition.schema.safeParse({ id: 'poi-1' }).success).toBe(true)
        expect(amapPoiSearchToolDefinition.formatInput?.({ keywords: 'private query' })).toBe('地图查询请求')
        expect(amapPoiSearchToolDefinition.getDisplayConfig?.()).toMatchObject({ title: '地点搜索' })
        expect(
            amapPoiSearchToolDefinition.formatPublicOutput?.({ facts: [{ address: 'private address' }], kind: 'poi-search', poiIds: [] })
        ).toBe('地图查询已完成。')
        expect(
            amapPoiSearchToolDefinition.formatPublicOutput?.({ facts: [], kind: 'poi-search', poiIds: [], resultStatus: 'no-result' })
        ).toBe('未找到地点。')
    })

    it('maps POI search through the static adapter and preserves only its observation', async () => {
        callAmapMcpToolMock.mockResolvedValueOnce({ cities: [], coordinates: [], facts: [], kind: 'poi-search', poiIds: ['poi-1'] })

        const result = await amapPoiSearchToolDefinition.tool.invoke({ keywords: 'museum' })

        expect(callAmapMcpToolMock).toHaveBeenCalledWith('amap-poi-search', { keywords: 'museum' }, undefined)
        expect(result).toMatchObject({ poiIds: ['poi-1'] })
    })
})
