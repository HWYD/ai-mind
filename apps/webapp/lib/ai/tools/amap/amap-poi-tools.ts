import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import { callAmapMcpTool } from '@/lib/ai/mcp/adapters/amap-mcp-tool-adapter'
import { isAmapMapsMcpAvailable } from '@/lib/ai/mcp/registry/server-definitions'

import type { ChatToolDefinition } from '../registry'
import { amapCoordinateSchema, formatAmapToolInput, formatAmapToolPublicOutput, normalizeAmapMapToolArgs } from './amap-tool-boundary'

const keywordSchema = z.string().trim().min(1).max(70)
const citySchema = z.string().trim().min(1).max(100)

export const amapPoiSearchToolSchema = z
    .object({
        city: citySchema.optional(),
        citylimit: z.boolean().optional(),
        keywords: keywordSchema.describe('地点或服务关键词，不得包含凭据。'),
    })
    .strict()

export const amapPoiNearbyToolSchema = z
    .object({
        keywords: keywordSchema,
        location: amapCoordinateSchema.describe('GCJ-02 longitude,latitude 坐标。'),
        radius: z.number().int().min(1).max(50_000).optional(),
        strategy: z.number().int().min(0).max(10).optional(),
    })
    .strict()

export const amapPoiDetailToolSchema = z
    .object({
        id: z.string().trim().min(1).max(128).describe('待查询的 POI ID，可来自用户、模型候选或此前结果。'),
    })
    .strict()

function createAmapPoiToolDefinition<T extends z.ZodType>(name: 'amap-poi-search' | 'amap-poi-nearby' | 'amap-poi-detail', schema: T) {
    const title = name === 'amap-poi-search' ? '地点搜索' : name === 'amap-poi-nearby' ? '周边地点搜索' : '地点详情查询'
    const mapTool = tool(async (args, config) => callAmapMcpTool(name, args as Record<string, unknown>, config?.signal), {
        description:
            name === 'amap-poi-search'
                ? '搜索明确关键词对应的地点。'
                : name === 'amap-poi-nearby'
                  ? '在明确 GCJ-02 坐标附近搜索地点。'
                  : '查询指定 POI ID 的地点详情。',
        name,
        schema,
    })

    return {
        executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool' as const, profile: 'remote-readonly' as const, retrySafe: true },
        formatInput: formatAmapToolInput,
        formatOutput: result => JSON.stringify(result),
        formatPublicOutput: formatAmapToolPublicOutput,
        getDisplayConfig: () => ({ action: 'query', title }),
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

export const amapPoiSearchToolDefinition = createAmapPoiToolDefinition('amap-poi-search', amapPoiSearchToolSchema)
export const amapPoiNearbyToolDefinition = createAmapPoiToolDefinition('amap-poi-nearby', amapPoiNearbyToolSchema)
export const amapPoiDetailToolDefinition = createAmapPoiToolDefinition('amap-poi-detail', amapPoiDetailToolSchema)
