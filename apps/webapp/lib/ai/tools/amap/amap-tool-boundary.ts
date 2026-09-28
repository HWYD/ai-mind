import { z } from 'zod'

const coordinateInputPattern = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

export const amapCoordinateSchema = z
    .string()
    .trim()
    .transform((value, context) => {
        const match = coordinateInputPattern.exec(value)
        if (!match) {
            context.addIssue({ code: 'custom', message: '坐标必须为 GCJ-02 longitude,latitude。' })
            return z.NEVER
        }

        const longitude = Number(match[1])
        const latitude = Number(match[2])
        if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            longitude < -180 ||
            longitude > 180 ||
            latitude < -90 ||
            latitude > 90
        ) {
            context.addIssue({ code: 'custom', message: 'GCJ-02 坐标超出有效范围。' })
            return z.NEVER
        }

        return `${longitude.toFixed(6)},${latitude.toFixed(6)}`
    })

export const amapCoordinateSystemSchema = z
    .enum(['GCJ-02', 'WGS-84', 'GPS', 'BD-09'])
    .optional()
    .superRefine((value, context) => {
        if (value && value !== 'GCJ-02') {
            context.addIssue({ code: 'custom', message: '仅支持 GCJ-02 坐标；请改用地址或提供 GCJ-02 坐标。' })
        }
    })

export const amapMapToolNames = [
    'amap-poi-search',
    'amap-poi-nearby',
    'amap-poi-detail',
    'amap-geocode',
    'amap-reverse-geocode',
    'amap-route-walking',
    'amap-route-driving',
    'amap-route-bicycling',
    'amap-route-transit',
] as const

export type AmapMapToolName = (typeof amapMapToolNames)[number]

export interface AmapToolObservation {
    cities: string[]
    coordinates: string[]
    facts: Array<Record<string, string>>
    kind: 'geocode' | 'poi-detail' | 'poi-nearby' | 'poi-search' | 'reverse-geocode' | 'route'
    poiIds: string[]
    resultStatus?: 'no-result'
    route?: {
        distance?: string
        duration?: string
        summary?: string
    }
}

export function isAmapMapToolName(value: string): value is AmapMapToolName {
    return (amapMapToolNames as readonly string[]).includes(value)
}

export function formatAmapToolInput(_args: unknown): string {
    return '地图查询请求'
}

export function formatAmapToolPublicOutput(result: unknown) {
    const observation = result as Partial<AmapToolObservation>
    if (observation.kind === 'route') return '路线规划已完成。'
    if (observation.resultStatus === 'no-result') return '未找到地点。'
    if (observation.poiIds?.length) return `地点查询已完成（${observation.poiIds.length} 项）。`
    return '地图查询已完成。'
}

export function normalizeAmapMapToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object') return args
    const normalized = { ...(args as Record<string, unknown>) }

    for (const key of ['location', 'origin', 'destination']) {
        const value = normalized[key]
        const parsed = amapCoordinateSchema.safeParse(value)
        if (parsed.success) normalized[key] = parsed.data
    }

    return normalized
}
