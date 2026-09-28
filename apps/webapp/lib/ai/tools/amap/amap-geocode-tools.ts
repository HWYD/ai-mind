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

export const amapGeocodeToolSchema = z
    .object({
        address: z.string().trim().min(1).max(240).describe('待查询的地址或城市名称，可来自用户或模型候选。'),
        city: z.string().trim().min(1).max(100).optional(),
    })
    .strict()

export const amapReverseGeocodeToolSchema = z
    .object({
        coordinateSystem: amapCoordinateSystemSchema,
        location: amapCoordinateSchema.describe('GCJ-02 longitude,latitude 坐标。'),
    })
    .strict()

function withoutCoordinateSystem(args: Record<string, unknown>) {
    const { coordinateSystem: _coordinateSystem, ...mcpArgs } = args
    return mcpArgs
}

function createAmapGeocodeToolDefinition<T extends z.ZodType>(name: 'amap-geocode' | 'amap-reverse-geocode', schema: T) {
    const title = name === 'amap-geocode' ? '地址转坐标' : '坐标转地址'
    const mapTool = tool(
        async (args, config) => callAmapMcpTool(name, withoutCoordinateSystem(args as Record<string, unknown>), config?.signal),
        {
            description: name === 'amap-geocode' ? '将地址转换为 GCJ-02 坐标。' : '将 GCJ-02 坐标转换为地址。',
            name,
            schema,
        }
    )

    return {
        executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool' as const, profile: 'remote-readonly' as const, retrySafe: true },
        formatInput: formatAmapToolInput,
        formatOutput: result => JSON.stringify(result),
        formatPublicOutput: formatAmapToolPublicOutput,
        getDisplayConfig: () => ({ action: 'geocode', title }),
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

export const amapGeocodeToolDefinition = createAmapGeocodeToolDefinition('amap-geocode', amapGeocodeToolSchema)
export const amapReverseGeocodeToolDefinition = createAmapGeocodeToolDefinition('amap-reverse-geocode', amapReverseGeocodeToolSchema)
