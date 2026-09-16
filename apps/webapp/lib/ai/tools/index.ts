import { calculatorToolDefinition } from './calculator-tool'
import { cityWeatherToolDefinition } from './city-weather-tool'
import { datetimeToolDefinition } from './datetime-tool'
import { type ChatToolDefinition, createChatToolRegistry, type ToolRuntimeScope } from './registry'
import { textTransformToolDefinition } from './text-transform-tool'
import { unitConvertToolDefinition } from './unit-convert-tool'
import { validateTasklistStructureToolDefinition } from './validate-tasklist-structure-tool'
import { readUrlToolDefinition } from './web/read-url-tool'
import { webSearchToolDefinition } from './web/web-search-tool'

const chatToolDefinitions: ChatToolDefinition[] = [
    calculatorToolDefinition,
    cityWeatherToolDefinition,
    datetimeToolDefinition,
    textTransformToolDefinition,
    unitConvertToolDefinition,
    validateTasklistStructureToolDefinition,
    webSearchToolDefinition,
    readUrlToolDefinition,
]

export const chatToolRegistry = createChatToolRegistry(chatToolDefinitions)

// 当前版本先通过统一 registry 管理工具，后续新增 Tool 时只扩这里即可。
export function getChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolRegistry.list()
}

export function getActiveChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolRegistry.listActive()
}

export function getChatToolDefinitionsForScope(scope: ToolRuntimeScope): ChatToolDefinition[] {
    return chatToolRegistry.listByRuntimeScope(scope)
}

export function getActiveChatToolDefinitionsForScope(scope: ToolRuntimeScope): ChatToolDefinition[] {
    return chatToolRegistry.listActiveByRuntimeScope(scope)
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
    validateTasklistStructureToolDefinition,
    webSearchToolDefinition,
    readUrlToolDefinition,
}
export {
    createChatToolRegistry,
    parseToolExecutionPolicy,
    toolExecutionPolicySchema,
    toolExecutionProfiles,
    toolRuntimeScopes,
    toolSupportsRuntimeScope,
} from './registry'
export type {
    ChatToolDefinition,
    ChatToolRegistry,
    ToolDisplayConfig,
    ToolExecutionPolicy,
    ToolExecutionResult,
    ToolRuntimeScope,
} from './registry'
