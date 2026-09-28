import { describe, expect, it, vi } from 'vitest'

const callAmapMcpToolMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/mcp/adapters/amap-mcp-tool-adapter', () => ({
    callAmapMcpTool: callAmapMcpToolMock,
}))

import { amapGeocodeToolDefinition, amapReverseGeocodeToolDefinition } from '@/lib/ai/tools/amap/amap-geocode-tools'

describe('AMap geocoding tools', () => {
    it('accepts bounded addresses and only GCJ-02 longitude,latitude coordinates', () => {
        expect(amapGeocodeToolDefinition.schema.safeParse({ address: 'sample address' }).success).toBe(true)
        expect(amapReverseGeocodeToolDefinition.schema.safeParse({ location: '116.3971234,39.9084567' }).data).toMatchObject({
            location: '116.397123,39.908457',
        })
        expect(
            amapReverseGeocodeToolDefinition.schema.safeParse({ coordinateSystem: 'WGS-84', location: '116.397123,39.908456' }).success
        ).toBe(false)
        expect(amapGeocodeToolDefinition.getDisplayConfig?.()).toMatchObject({ title: '地址转坐标' })
        expect(amapReverseGeocodeToolDefinition.getDisplayConfig?.()).toMatchObject({
            title: '坐标转地址',
        })
    })

    it('never forwards the local coordinate-system provenance field to MCP', async () => {
        callAmapMcpToolMock.mockResolvedValueOnce({ cities: [], coordinates: [], facts: [], kind: 'reverse-geocode', poiIds: [] })

        await amapReverseGeocodeToolDefinition.tool.invoke({ coordinateSystem: 'GCJ-02', location: '116.397123,39.908456' })

        expect(callAmapMcpToolMock).toHaveBeenCalledWith('amap-reverse-geocode', { location: '116.397123,39.908456' }, undefined)
    })
})
