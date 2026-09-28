import { resolve } from 'node:path'

import { config } from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'

import { callAmapMcpTool } from '@/lib/ai/mcp/adapters/amap-mcp-tool-adapter'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'

config({ path: resolve(process.cwd(), '.env.local') })

const describeAmapSmoke = process.env.AI_MIND_AMAP_MCP_KEY?.trim() ? describe : describe.skip
const origin = '116.397128,39.916527'
const destination = '116.407128,39.926527'

describeAmapSmoke('AMap MCP live smoke', () => {
    afterAll(async () => {
        await mcpClientManager.close('amap-maps')
    })

    it('runs the nine fixed local capabilities through the server-side adapter', async () => {
        const poiSearch = await callAmapMcpTool('amap-poi-search', { city: '北京', keywords: '博物馆' })
        const poiId = poiSearch.poiIds[0]

        expect(poiSearch.kind).toBe('poi-search')
        expect(poiId).toEqual(expect.any(String))

        await expect(callAmapMcpTool('amap-poi-nearby', { keywords: '博物馆', location: origin })).resolves.toMatchObject({
            kind: 'poi-nearby',
        })
        await expect(callAmapMcpTool('amap-poi-detail', { id: poiId! })).resolves.toMatchObject({ kind: 'poi-detail' })
        await expect(callAmapMcpTool('amap-geocode', { address: '北京市东城区景山前街4号', city: '北京' })).resolves.toMatchObject({
            kind: 'geocode',
        })
        await expect(callAmapMcpTool('amap-reverse-geocode', { location: origin })).resolves.toMatchObject({ kind: 'reverse-geocode' })
        await expect(callAmapMcpTool('amap-route-walking', { destination, origin })).resolves.toMatchObject({ kind: 'route' })
        await expect(callAmapMcpTool('amap-route-driving', { destination, origin })).resolves.toMatchObject({ kind: 'route' })
        await expect(callAmapMcpTool('amap-route-bicycling', { destination, origin })).resolves.toMatchObject({ kind: 'route' })
        await expect(callAmapMcpTool('amap-route-transit', { city: '北京', cityd: '北京', destination, origin })).resolves.toMatchObject({
            kind: 'route',
        })
    }, 120_000)

    it('accepts a three-call city geocoding batch through one MCP client session', async () => {
        const results = await Promise.all([
            callAmapMcpTool('amap-geocode', { address: '北京', city: '北京' }),
            callAmapMcpTool('amap-geocode', { address: '上海', city: '上海' }),
            callAmapMcpTool('amap-geocode', { address: '深圳', city: '深圳' }),
        ])

        expect(results).toHaveLength(3)
        expect(results.every(result => result.kind === 'geocode')).toBe(true)
    }, 60_000)

    it('paces three detail batches through the shared map MCP client', async () => {
        const poiSearch = await callAmapMcpTool('amap-poi-search', { city: '北京', keywords: '博物馆' })
        const poiId = poiSearch.poiIds[0]

        expect(poiId).toEqual(expect.any(String))

        const results = await Promise.all(Array.from({ length: 9 }, () => callAmapMcpTool('amap-poi-detail', { id: poiId! })))

        expect(results).toHaveLength(9)
        expect(results.every(result => result.kind === 'poi-detail')).toBe(true)
    }, 120_000)
})
