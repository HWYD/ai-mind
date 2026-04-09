import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import { weatherToolAdapter } from '@/lib/ai/mcp/adapters'

import type { ChatToolDefinition } from './registry'

const cityWeatherToolSchema = z.object({
    city: z.string().trim().min(1).max(100).describe('需要查询实时天气的城市名，例如北京、上海、广州。'),
})

function normalizeCity(city: string) {
    return city.trim()
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

/**
 * `city-weather` 对模型仍然保持原有能力名。
 * 这里只替换底层能力来源，不改变模型侧的调用心智。
 */
export const cityWeatherTool = tool(
    async ({ city }) => {
        const normalizedCity = normalizeCity(city)
        const result = await weatherToolAdapter.call({
            city: normalizedCity,
        })

        return result.outputText
    },
    {
        description: '查询指定城市的实时天气、温度和湿度，适用于“北京天气怎么样”“上海现在温度多少”这类问题。',
        name: 'city-weather',
        schema: cityWeatherToolSchema,
    }
)

export const cityWeatherToolDefinition: ChatToolDefinition<z.infer<typeof cityWeatherToolSchema>> = {
    name: 'city-weather',
    tool: cityWeatherTool,
    schema: cityWeatherToolSchema,
    normalizeArgs: normalizeCityWeatherToolArgs,
    formatInput: formatCityWeatherToolInput,
    // 展示层继续沿用原能力名，但会标记当前结果来自 MCP。
    getDisplayConfig: args => ({
        title: 'city-weather',
        action: 'current',
        inputPreview: formatCityWeatherToolInput(args),
    }),
    source: 'mcp',
    serverId: 'weather-server',
}
