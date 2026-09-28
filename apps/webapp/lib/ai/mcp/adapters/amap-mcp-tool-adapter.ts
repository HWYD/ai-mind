import { isAbortError } from '@/lib/ai/error-utils'
import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError, type MCPHostErrorCode } from '@/lib/ai/mcp/protocol/errors'
import { amapCoordinateSchema, type AmapMapToolName, type AmapToolObservation } from '@/lib/ai/tools/amap/amap-tool-boundary'
import { assertOutboundDataAllowed } from '@/lib/ai/tools/web/outbound-secret-guard'
import { resolveOutboundKnownSecrets } from '@/lib/ai/tools/web/web-provider-config'

const AMAP_SERVER_ID = 'amap-maps' as const

export const AMAP_MCP_TOOL_MAPPING: Record<AmapMapToolName, string> = {
    'amap-geocode': 'maps_geo',
    'amap-poi-detail': 'maps_search_detail',
    'amap-poi-nearby': 'maps_around_search',
    'amap-poi-search': 'maps_text_search',
    'amap-reverse-geocode': 'maps_regeocode',
    'amap-route-bicycling': 'maps_direction_bicycling',
    'amap-route-driving': 'maps_direction_driving',
    'amap-route-transit': 'maps_direction_transit_integrated',
    'amap-route-walking': 'maps_direction_walking',
}

export function getAmapMcpToolMapping(name: string) {
    return AMAP_MCP_TOOL_MAPPING[name as AmapMapToolName]
}

function toRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function firstArray(value: unknown, keys: string[]) {
    const record = toRecord(value)
    for (const key of keys) {
        const candidate = record?.[key]
        if (Array.isArray(candidate)) return candidate
    }
    return undefined
}

function text(value: unknown, max = 300) {
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function httpStatus(value: unknown) {
    const status = positiveInteger(value)
    return status !== undefined && status >= 100 && status <= 599 ? status : undefined
}

function coordinate(value: unknown) {
    const parsed = amapCoordinateSchema.safeParse(value)
    return parsed.success ? parsed.data : ''
}

function parsePayload(result: Awaited<ReturnType<typeof mcpClientManager.callTool>>['result']): Record<string, unknown> | undefined {
    const structured = toRecord(result.structuredContent)
    if (structured) return structured

    for (const content of result.content ?? []) {
        if (content.type !== 'text' || typeof content.text !== 'string') continue
        try {
            const parsed = toRecord(JSON.parse(content.text))
            if (parsed) return parsed
        } catch {
            // 远端文本不是可验证 JSON 时不作为 observation 使用。
        }
    }
    return undefined
}

type AmapMcpToolResult = Awaited<ReturnType<typeof mcpClientManager.callTool>>['result']

interface AmapMcpFailureClassification {
    code: MCPHostErrorCode
    retryAfterMs?: number
    retryLimit?: 1 | 2
    retryable: boolean
    status?: number
}

function parseErrorRecord(value: unknown) {
    if (typeof value !== 'string') return undefined
    try {
        return toRecord(JSON.parse(value))
    } catch {
        return undefined
    }
}

function classifyAmapMcpIsError(result: AmapMcpToolResult): AmapMcpFailureClassification {
    const errorTexts = (result.content ?? []).flatMap(content => (content.type === 'text' ? [content.text.slice(0, 2000)] : []))
    const records = [toRecord(result.structuredContent), ...errorTexts.map(parseErrorRecord)].filter(
        (value): value is Record<string, unknown> => Boolean(value)
    )
    const status = records.map(record => httpStatus(record.status ?? record.statusCode ?? record.httpStatus)).find(Boolean)
    const retryAfterMs = records.map(record => positiveInteger(record.retryAfterMs ?? record.retry_after_ms)).find(Boolean)
    const signal = [
        ...records.flatMap(record =>
            [record.code, record.errorCode, record.infoCode, record.infocode].filter((value): value is string => typeof value === 'string')
        ),
        ...errorTexts,
    ]
        .join(' ')
        .toLowerCase()

    if (
        /daily_query_over_limit|monthly_query_over_limit|quota.*(?:exhaust|exceed|limit)|(?:daily|monthly).*(?:quota|limit)|配额.*(?:耗尽|超出)|(?:日|月).*(?:额度|配额|限额)/i.test(
            signal
        ) ||
        /(?:invalid|expired).*(?:key|api key)|(?:key|api key).*(?:invalid|expired)|unauthori[sz]ed|forbidden|permission|权限|鉴权|授权/i.test(
            signal
        )
    ) {
        return {
            code: 'REQUEST_FAILED',
            retryable: false,
            ...(status !== undefined ? { status } : {}),
        }
    }

    if (/invalid (?:parameter|argument)|(?:invalid|missing).*(?:parameter|argument)|参数.*(?:错误|无效)|缺少参数/i.test(signal)) {
        return { code: 'REQUEST_FAILED', retryable: false, status: status ?? 400 }
    }

    if (status !== undefined) {
        return {
            code: 'REQUEST_FAILED',
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            retryable: status === 429 || status >= 500,
            status,
        }
    }

    if (/timeout|timed out|超时/i.test(signal)) {
        return { code: 'TIMEOUT', retryable: true }
    }

    if (/connection (?:failed|reset)|connect failed|连接失败|连接重置/i.test(signal)) {
        return { code: 'CONNECT_FAILED', retryable: true }
    }

    if (/too_many_requests|rate[ _-]?limit|too (?:many|frequent)|qps|频率|限流|过于频繁/i.test(signal)) {
        return {
            code: 'REQUEST_FAILED',
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            retryable: true,
            status: 429,
        }
    }

    if (/service unavailable|server busy|temporar(?:y|ily)|服务繁忙|系统繁忙|服务不可用/i.test(signal)) {
        return { code: 'REQUEST_FAILED', retryable: true, status: 503 }
    }

    return { code: 'REQUEST_FAILED', retryLimit: 1, retryable: true }
}

function collectPoiPayload(payload: Record<string, unknown>, kind: AmapToolObservation['kind']): AmapToolObservation {
    const poiValues = firstArray(payload, ['pois', 'results'])
    if (!poiValues) {
        throw new MCPHostError('REQUEST_FAILED', '地图服务没有返回可用结果。')
    }

    if (poiValues.length === 0) {
        return {
            cities: [],
            coordinates: [],
            facts: [],
            kind,
            poiIds: [],
            resultStatus: 'no-result',
        }
    }

    const poiRecords = poiValues.map(toRecord).filter((value): value is Record<string, unknown> => Boolean(value))
    const facts = poiRecords.slice(0, 5).flatMap(poi => {
        const fact = {
            ...(text(poi.name) ? { name: text(poi.name) } : {}),
            ...(text(poi.id) ? { id: text(poi.id) } : {}),
            ...(text(poi.address) ? { address: text(poi.address) } : {}),
            ...(coordinate(poi.location) ? { location: coordinate(poi.location) } : {}),
            ...(text(poi.cityname ?? poi.city) ? { city: text(poi.cityname ?? poi.city) } : {}),
        }
        return Object.keys(fact).length ? [fact] : []
    })

    if (facts.length === 0) {
        throw new MCPHostError('REQUEST_FAILED', '地图服务没有返回可用结果。')
    }

    return {
        cities: facts.flatMap(fact => (fact.city ? [fact.city] : [])),
        coordinates: facts.flatMap(fact => (fact.location ? [fact.location] : [])),
        facts,
        kind,
        poiIds: facts.flatMap(fact => (fact.id ? [fact.id] : [])),
    }
}

function collectGeocodePayload(payload: Record<string, unknown>, kind: 'geocode' | 'reverse-geocode'): AmapToolObservation {
    const nested = toRecord(payload.regeocode) ?? payload
    const entries = (firstArray(nested, ['results', 'geocodes']) ?? [])
        .map(toRecord)
        .filter((value): value is Record<string, unknown> => Boolean(value))
    const candidates = entries.length > 0 ? entries : [nested]
    const facts = candidates.slice(0, 3).flatMap(entry => {
        const fact = {
            ...(text(entry.formatted_address ?? entry.formattedAddress ?? entry.address)
                ? {
                      address: text(entry.formatted_address ?? entry.formattedAddress ?? entry.address),
                  }
                : {}),
            ...(coordinate(entry.location) ? { location: coordinate(entry.location) } : {}),
            ...(text(entry.city ?? entry.cityname) ? { city: text(entry.city ?? entry.cityname) } : {}),
        }
        return Object.keys(fact).length ? [fact] : []
    })

    return {
        cities: facts.flatMap(fact => (fact.city ? [fact.city] : [])),
        coordinates: facts.flatMap(fact => (fact.location ? [fact.location] : [])),
        facts,
        kind,
        poiIds: [],
    }
}

function collectReverseGeocodePayload(payload: Record<string, unknown>): AmapToolObservation {
    const result = toRecord(payload.regeocode) ?? payload
    const fact = {
        ...(text(result.country) ? { country: text(result.country) } : {}),
        ...(text(result.province) ? { province: text(result.province) } : {}),
        ...(text(result.city) ? { city: text(result.city) } : {}),
        ...(text(result.district) ? { district: text(result.district) } : {}),
    }

    return {
        cities: fact.city ? [fact.city] : [],
        coordinates: [],
        facts: Object.keys(fact).length ? [fact] : [],
        kind: 'reverse-geocode',
        poiIds: [],
    }
}

function collectRoutePayload(payload: Record<string, unknown>): AmapToolObservation {
    const route = toRecord(payload.route) ?? payload
    const paths = (firstArray(route, ['paths', 'transits']) ?? [])
        .map(toRecord)
        .filter((value): value is Record<string, unknown> => Boolean(value))
    const firstPath = paths[0]
    const summary = text(firstPath?.instruction ?? firstPath?.summary ?? route.summary, 240)
    const distance = text(route.distance ?? firstPath?.distance)
    const duration = text(route.duration ?? firstPath?.duration)
    const coordinates = [coordinate(route.origin), coordinate(route.destination)].filter(Boolean)

    return {
        cities: [],
        coordinates,
        facts: [],
        kind: 'route',
        poiIds: [],
        route: {
            ...(distance ? { distance } : {}),
            ...(duration ? { duration } : {}),
            ...(summary ? { summary } : {}),
        },
    }
}

function toObservation(localToolName: AmapMapToolName, payload: Record<string, unknown>) {
    switch (localToolName) {
        case 'amap-poi-search':
            return collectPoiPayload(payload, 'poi-search')
        case 'amap-poi-nearby':
            return collectPoiPayload(payload, 'poi-nearby')
        case 'amap-poi-detail':
            return collectPoiPayload({ pois: [payload] }, 'poi-detail')
        case 'amap-geocode':
            return collectGeocodePayload(payload, 'geocode')
        case 'amap-reverse-geocode':
            return collectReverseGeocodePayload(payload)
        default:
            return collectRoutePayload(payload)
    }
}

export async function callAmapMcpTool(localToolName: AmapMapToolName, args: Record<string, unknown>, signal?: AbortSignal) {
    const remoteToolName = AMAP_MCP_TOOL_MAPPING[localToolName]
    try {
        assertOutboundDataAllowed(JSON.stringify(args), { knownSecrets: resolveOutboundKnownSecrets() })
        const response = await mcpClientManager.callTool(
            AMAP_SERVER_ID,
            { arguments: args, name: remoteToolName },
            { allowSessionRecovery: false, ...(signal ? { signal } : {}) }
        )
        if (response.result.isError) {
            throw new MCPHostError('REQUEST_FAILED', '地图服务请求失败。', classifyAmapMcpIsError(response.result))
        }
        const payload = parsePayload(response.result)
        if (!payload) {
            throw new MCPHostError('REQUEST_FAILED', '地图服务没有返回可用结果。')
        }
        return toObservation(localToolName, payload)
    } catch (error) {
        if (isAbortError(error)) throw error
        if (error instanceof MCPHostError) {
            const message = error.message === '地图服务没有返回可用结果。' ? error.message : '地图服务请求失败。'
            throw new MCPHostError(error.code, message, {
                ...(error.status !== undefined ? { status: error.status } : {}),
                ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}),
                ...(error.retryLimit !== undefined ? { retryLimit: error.retryLimit } : {}),
                ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
            })
        }
        throw new MCPHostError('REQUEST_FAILED', '地图服务请求失败。')
    }
}
