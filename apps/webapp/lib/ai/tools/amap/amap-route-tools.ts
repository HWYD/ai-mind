import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import { callAmapMcpTool } from '@/lib/ai/mcp/adapters/amap-mcp-tool-adapter'
import { isAmapMapsMcpAvailable } from '@/lib/ai/mcp/registry/server-definitions'

import type { ChatToolDefinition } from '../registry'
import {
    amapCoordinateSchema,
    amapCoordinateSystemSchema,
    formatAmapToolInput,
    formatAmapToolPublicOutput,
    normalizeAmapMapToolArgs,
} from './amap-tool-boundary'

const routeLocationShape = {
    coordinateSystem: amapCoordinateSystemSchema,
    destination: amapCoordinateSchema.describe('GCJ-02 longitude,latitude 坐标。'),
    origin: amapCoordinateSchema.describe('GCJ-02 longitude,latitude 坐标。'),
}

export const amapRouteWalkingToolSchema = z.object(routeLocationShape).strict()
export const amapRouteDrivingToolSchema = z.object(routeLocationShape).strict()
export const amapRouteBicyclingToolSchema = z.object(routeLocationShape).strict()
export const amapRouteTransitToolSchema = z
    .object({
        ...routeLocationShape,
        city: z.string().trim().min(1).max(100),
        cityd: z.string().trim().min(1).max(100),
    })
    .strict()

function withoutCoordinateSystem(args: Record<string, unknown>) {
    const { coordinateSystem: _coordinateSystem, ...mcpArgs } = args
    return mcpArgs
}

function createAmapRouteToolDefinition<T extends z.ZodType>(
    name: 'amap-route-walking' | 'amap-route-driving' | 'amap-route-bicycling' | 'amap-route-transit',
    schema: T
) {
    const title =
        name === 'amap-route-walking'
            ? '步行路线规划'
            : name === 'amap-route-driving'
              ? '驾车路线规划'
              : name === 'amap-route-bicycling'
                ? '骑行路线规划'
                : '公交路线规划'
    const mapTool = tool(
        async (args, config) => callAmapMcpTool(name, withoutCoordinateSystem(args as Record<string, unknown>), config?.signal),
        {
            description: '根据明确 GCJ-02 起点和终点规划路线。公交路线还必须提供起点城市和终点城市。',
            name,
            schema,
        }
    )

    return {
        executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool' as const, profile: 'remote-readonly' as const, retrySafe: true },
        formatInput: formatAmapToolInput,
        formatOutput: result => JSON.stringify(result),
        formatPublicOutput: formatAmapToolPublicOutput,
        getDisplayConfig: () => ({ action: 'route', title }),
        isAvailable: isAmapMapsMcpAvailable,
        name,
        normalizeArgs: normalizeAmapMapToolArgs,
        runtimeScopes: ['general-react-agent'] as const,
        schema,
        serverId: 'amap-maps',
        source: 'mcp' as const,
        tool: mapTool,
    } satisfies ChatToolDefinition
}

export const amapRouteWalkingToolDefinition = createAmapRouteToolDefinition('amap-route-walking', amapRouteWalkingToolSchema)
export const amapRouteDrivingToolDefinition = createAmapRouteToolDefinition('amap-route-driving', amapRouteDrivingToolSchema)
export const amapRouteBicyclingToolDefinition = createAmapRouteToolDefinition('amap-route-bicycling', amapRouteBicyclingToolSchema)
export const amapRouteTransitToolDefinition = createAmapRouteToolDefinition('amap-route-transit', amapRouteTransitToolSchema)
