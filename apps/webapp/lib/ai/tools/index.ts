import type { ZodType } from 'zod'

import { calculatorTool, calculatorToolSchema, formatCalculatorToolInput, normalizeCalculatorToolArgs } from './calculator-tool'

export interface ChatToolDefinition {
    name: string
    tool: typeof calculatorTool
    schema: ZodType
    normalizeArgs?: (args: unknown) => unknown
    formatInput?: (args: unknown) => string
    resultIsAuthoritative?: boolean
    isAvailable?: () => boolean
}

const calculatorToolDefinition: ChatToolDefinition = {
    name: 'calculator',
    tool: calculatorTool,
    schema: calculatorToolSchema,
    normalizeArgs: normalizeCalculatorToolArgs,
    formatInput: formatCalculatorToolInput,
    resultIsAuthoritative: true,
}

const chatToolDefinitions = [calculatorToolDefinition]
const chatToolDefinitionMap = new Map(chatToolDefinitions.map(toolDefinition => [toolDefinition.name, toolDefinition]))

// 统一从这里注册工具，当前版本只保留一个 calculator，后续版本再扩展更多工具。
export function getChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolDefinitions
}

// 运行时只返回当前真正可用的工具集合。
export function getActiveChatToolDefinitions(): ChatToolDefinition[] {
    return chatToolDefinitions.filter(toolDefinition => toolDefinition.isAvailable?.() ?? true)
}

export function getChatToolDefinition(toolName: string): ChatToolDefinition | undefined {
    return chatToolDefinitionMap.get(toolName)
}
