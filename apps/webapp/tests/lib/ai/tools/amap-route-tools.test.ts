import { describe, expect, it, vi } from 'vitest'

const callAmapMcpToolMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai/mcp/adapters/amap-mcp-tool-adapter', () => ({
    callAmapMcpTool: callAmapMcpToolMock,
}))

import {
    amapRouteBicyclingToolDefinition,
    amapRouteDrivingToolDefinition,
    amapRouteTransitToolDefinition,
    amapRouteWalkingToolDefinition,
} from '@/lib/ai/tools/amap/amap-route-tools'

describe('AMap route tools', () => {
    it('keeps all four modes on bounded GCJ-02 inputs and requires transit cities', () => {
        const locationArgs = { destination: '116.397123,39.908456', origin: '116.390000,39.900000' }
        expect(amapRouteWalkingToolDefinition.schema.safeParse(locationArgs).success).toBe(true)
        expect(amapRouteDrivingToolDefinition.schema.safeParse(locationArgs).success).toBe(true)
        expect(amapRouteBicyclingToolDefinition.schema.safeParse(locationArgs).success).toBe(true)
        expect(amapRouteTransitToolDefinition.schema.safeParse(locationArgs).success).toBe(false)
        expect(amapRouteTransitToolDefinition.schema.safeParse({ ...locationArgs, city: 'Beijing', cityd: 'Beijing' }).success).toBe(true)
        expect(amapRouteWalkingToolDefinition.getDisplayConfig?.()).toMatchObject({ title: '步行路线规划' })
        expect(amapRouteDrivingToolDefinition.getDisplayConfig?.()).toMatchObject({ title: '驾车路线规划' })
        expect(amapRouteBicyclingToolDefinition.getDisplayConfig?.()).toMatchObject({ title: '骑行路线规划' })
        expect(amapRouteTransitToolDefinition.getDisplayConfig?.()).toMatchObject({
            title: '公交路线规划',
        })
    })

    it('maps driving through the static adapter and projects no route details publicly', async () => {
        callAmapMcpToolMock.mockResolvedValueOnce({
            cities: [],
            coordinates: [],
            facts: [],
            kind: 'route',
            poiIds: [],
            route: { distance: '1 km' },
        })
        const args = { destination: '116.397123,39.908456', origin: '116.390000,39.900000' }

        await amapRouteDrivingToolDefinition.tool.invoke(args)

        expect(callAmapMcpToolMock).toHaveBeenCalledWith('amap-route-driving', args, undefined)
        expect(amapRouteDrivingToolDefinition.formatPublicOutput?.({ kind: 'route', route: { summary: 'private directions' } })).toBe(
            '路线规划已完成。'
        )
    })
})
