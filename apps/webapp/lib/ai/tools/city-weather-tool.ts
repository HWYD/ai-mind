import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from './registry'

const cityWeatherToolSchema = z.object({
    city: z.string().trim().min(1).max(100).describe('需要查询实时天气的城市名，例如北京、上海、广州。'),
})

interface WttrDescriptionItem {
    value?: string
}

interface WttrCurrentCondition {
    temp_C?: string
    humidity?: string
    FeelsLikeC?: string
    windspeedKmph?: string
    weatherDesc?: WttrDescriptionItem[]
}

interface WttrResponse {
    current_condition?: WttrCurrentCondition[]
}

const weatherDescriptionTranslations: Record<string, string> = {
    Clear: '晴',
    Sunny: '晴',
    Overcast: '多云',
    Cloudy: '多云',
    'Partly cloudy': '局部多云',
    Mist: '薄雾',
    Fog: '雾',
    Haze: '霾',
    'Patchy rain nearby': '附近有零星降雨',
    'Light rain': '小雨',
    'Moderate rain': '中雨',
    'Heavy rain': '大雨',
    'Light drizzle': '毛毛雨',
    'Moderate or heavy rain shower': '阵雨',
    'Thundery outbreaks nearby': '附近有雷暴',
    Snow: '雪',
    'Light snow': '小雪',
    'Moderate snow': '中雪',
    Blizzard: '暴风雪',
}

function normalizeCity(city: string) {
    return city.trim()
}

function normalizeWeatherDescription(description: string) {
    const normalizedDescription = description.trim()

    return weatherDescriptionTranslations[normalizedDescription] ?? normalizedDescription
}

function formatCityWeatherOutput(city: string, payload: WttrResponse) {
    const current = payload.current_condition?.[0]

    if (!current) {
        throw new Error('天气服务没有返回有效结果，请稍后重试。')
    }

    const weather = normalizeWeatherDescription(current.weatherDesc?.[0]?.value?.trim() || '未知')
    const temperature = current.temp_C?.trim() || '未知'
    const feelsLike = current.FeelsLikeC?.trim()
    const humidity = current.humidity?.trim() || '未知'
    const windspeed = current.windspeedKmph?.trim()

    return [
        `城市：${city}`,
        `天气：${weather}`,
        `温度：${temperature}°C`,
        feelsLike ? `体感温度：${feelsLike}°C` : '',
        `湿度：${humidity}%`,
        windspeed ? `风速：${windspeed} km/h` : '',
        '来源：wttr.in',
    ]
        .filter(Boolean)
        .join('\n')
}

export function normalizeCityWeatherToolArgs(args: unknown): unknown {
    if (!args || typeof args !== 'object' || !('city' in args)) {
        return args
    }

    const normalizedArgs = { ...args } as Record<string, unknown>

    if (typeof normalizedArgs.city === 'string') {
        normalizedArgs.city = normalizeCity(normalizedArgs.city)
    }

    return normalizedArgs
}

export function formatCityWeatherToolInput(args: unknown): string {
    if (!args || typeof args !== 'object' || !('city' in args)) {
        return JSON.stringify(args ?? {}, null, 2)
    }

    return `city=${String((args as Record<string, unknown>).city ?? '')}`
}

// city-weather 只负责指定城市的当前天气查询，不承担预报、搜索或百科解释。
export const cityWeatherTool = tool(
    async ({ city }) => {
        const normalizedCity = normalizeCity(city)
        const response = await fetch(`https://wttr.in/${encodeURIComponent(normalizedCity)}?format=j1&lang=zh-cn`, {
            headers: {
                Accept: 'application/json',
            },
        })

        if (!response.ok) {
            throw new Error(`天气服务请求失败，状态码：${response.status}`)
        }

        const payload = (await response.json()) as WttrResponse

        return formatCityWeatherOutput(normalizedCity, payload)
    },
    {
        name: 'city-weather',
        description: '查询指定城市的实时天气、温度和湿度，适用于北京天气怎么样、上海现在温度多少这类问题。',
        schema: cityWeatherToolSchema,
    }
)

export const cityWeatherToolDefinition: ChatToolDefinition<z.infer<typeof cityWeatherToolSchema>> = {
    name: 'city-weather',
    tool: cityWeatherTool,
    schema: cityWeatherToolSchema,
    normalizeArgs: normalizeCityWeatherToolArgs,
    formatInput: formatCityWeatherToolInput,
    getDisplayConfig: args => ({
        title: 'city-weather',
        action: 'current',
        inputPreview: formatCityWeatherToolInput(args),
    }),
}
