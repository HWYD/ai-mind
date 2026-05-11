import { calculatorToolDefinition } from './calculator-tool'
import { cityWeatherToolDefinition } from './city-weather-tool'
import { datetimeToolDefinition } from './datetime-tool'
import { type ChatToolDefinition, createChatToolRegistry } from './registry'
import { textTransformToolDefinition } from './text-transform-tool'
import { unitConvertToolDefinition } from './unit-convert-tool'

const chatToolDefinitions: ChatToolDefinition[] = [
    calculatorToolDefinition,
    cityWeatherToolDefinition,
    datetimeToolDefinition,
    textTransformToolDefinition,
    unitConvertToolDefinition,
]

export const chatToolRegistry = createChatToolRegistry(chatToolDefinitions)

// 当前版本先通过统一 registry 管理工具，后续新增 Tool 时只扩这里即可。
export function getChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolRegistry.list()
}

export function getActiveChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolRegistry.listActive()
}

export function getChatToolDefinition(toolName: string): ChatToolDefinition | undefined {
    return chatToolRegistry.get(toolName)
}

export {
    calculatorToolDefinition,
    cityWeatherToolDefinition,
    datetimeToolDefinition,
    textTransformToolDefinition,
    unitConvertToolDefinition,
}
export type { ChatToolDefinition, ChatToolRegistry, ToolDisplayConfig, ToolExecutionResult } from './registry'
