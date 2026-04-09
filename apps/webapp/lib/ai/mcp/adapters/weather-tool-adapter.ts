import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPToolAdapterResult } from '@/lib/ai/mcp/protocol/types'

import type { MCPToolAdapter } from './types'

export interface WeatherToolAdapterInput {
    city: string
}

const WEATHER_SERVER_ID = 'weather-server'
const WEATHER_TOOL_NAME = 'get_weather'

function extractToolText(result: Awaited<ReturnType<typeof mcpClientManager.callTool>>['result']) {
    const textParts: string[] = []

    for (const contentPart of result.content ?? []) {
        if (contentPart.type === 'text' && typeof contentPart.text === 'string') {
            const normalizedText = contentPart.text.trim()

            if (normalizedText) {
                textParts.push(normalizedText)
            }
        }
    }

    if (textParts.length > 0) {
        return textParts.join('\n')
    }

    if (result.structuredContent) {
        return JSON.stringify(result.structuredContent, null, 2)
    }

    return ''
}

/**
 * 把 `city-weather` 映射到 MCP weather server。
 * 这一层只负责参数映射、错误翻译和结果标准化，不暴露 MCP 原始响应给主运行时。
 */
export const weatherToolAdapter: MCPToolAdapter<WeatherToolAdapterInput> = {
    async call(input): Promise<MCPToolAdapterResult> {
        // 对模型侧继续保留 `city-weather`，这里只负责把它转成底层 MCP Tool 调用。
        const response = await mcpClientManager.callTool(WEATHER_SERVER_ID, {
            arguments: {
                city: input.city,
            },
            name: WEATHER_TOOL_NAME,
        })
        const outputText = extractToolText(response.result)

        if (response.result.isError) {
            throw new MCPHostError('REQUEST_FAILED', outputText || '天气 MCP Tool 调用失败。')
        }

        if (!outputText) {
            throw new MCPHostError('REQUEST_FAILED', '天气 MCP Tool 没有返回可用文本结果。')
        }

        // 统一整理成当前 Runtime 已经能直接消费的 Tool 结果结构。
        return {
            action: 'current',
            inputText: `city=${input.city}`,
            outputText,
            serverId: WEATHER_SERVER_ID,
            source: 'mcp',
            title: 'city-weather',
            toolName: 'city-weather',
        }
    },
}
