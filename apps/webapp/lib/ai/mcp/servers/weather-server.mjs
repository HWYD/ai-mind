import { z } from 'zod'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new McpServer({
    name: 'weather-server',
    version: '0.0.9',
})

const weatherDescriptionTranslations = {
    Blizzard: '暴风雪',
    Clear: '晴',
    Cloudy: '多云',
    Fog: '雾',
    Haze: '霾',
    'Heavy rain': '大雨',
    'Light drizzle': '毛毛雨',
    'Light rain': '小雨',
    'Light snow': '小雪',
    Mist: '薄雾',
    'Moderate or heavy rain shower': '阵雨',
    'Moderate rain': '中雨',
    'Moderate snow': '中雪',
    Overcast: '阴',
    'Partly cloudy': '局部多云',
    'Patchy rain nearby': '附近有零星降雨',
    Snow: '雪',
    Sunny: '晴',
    'Thundery outbreaks nearby': '附近有雷暴',
}

function normalizeCity(city) {
    return city.trim()
}

function normalizeWeatherDescription(description) {
    const normalizedDescription = description.trim()

    return weatherDescriptionTranslations[normalizedDescription] ?? normalizedDescription
}

function formatWeatherOutput(city, payload) {
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
        '来源：wttr.in（通过 MCP weather-server 提供）',
    ]
        .filter(Boolean)
        .join('\n')
}

server.registerTool(
    'get_weather',
    {
        description: '查询指定城市的实时天气、温度和湿度。',
        inputSchema: {
            city: z.string().trim().min(1).max(100).describe('需要查询天气的城市名，例如北京、上海、广州。'),
        },
        title: '天气查询',
    },
    async ({ city }) => {
        try {
            const normalizedCity = normalizeCity(city)
            const response = await fetch(`https://wttr.in/${encodeURIComponent(normalizedCity)}?format=j1&lang=zh-cn`, {
                headers: {
                    Accept: 'application/json',
                },
            })

            if (!response.ok) {
                return {
                    content: [
                        {
                            text: `天气服务请求失败，状态码：${response.status}`,
                            type: 'text',
                        },
                    ],
                    isError: true,
                }
            }

            const payload = await response.json()
            const outputText = formatWeatherOutput(normalizedCity, payload)

            return {
                content: [
                    {
                        text: outputText,
                        type: 'text',
                    },
                ],
            }
        } catch (error) {
            return {
                content: [
                    {
                        text: error instanceof Error ? error.message : '天气 MCP Server 执行失败。',
                        type: 'text',
                    },
                ],
                isError: true,
            }
        }
    }
)

const transport = new StdioServerTransport()

server.connect(transport).catch(error => {
    console.error('weather-server 启动失败:', error)
    process.exit(1)
})
