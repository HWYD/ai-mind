import type { StructuredToolInterface } from '@langchain/core/tools'
import type { ZodType } from 'zod'

export interface ToolExecutionResult {
    content: string
    metadata?: Record<string, unknown>
}

export interface ToolDisplayConfig {
    title?: string
    action?: string
    inputPreview?: string
}

export interface ChatToolDefinition<TArgs = unknown> {
    // 工具唯一标识，供模型返回的 tool name 与运行时做映射。
    name: string
    // LangChain 工具实例，负责真正的执行逻辑。
    tool: StructuredToolInterface
    // 工具输入的运行时校验 schema。
    schema: ZodType<TArgs>
    // 在执行 schema 校验前，对模型参数做轻量归一化。
    normalizeArgs?: (args: unknown) => unknown
    // 把已校验的输入格式化成前端更易读的文本。
    formatInput?: (args: TArgs) => string
    // 把工具原始结果整理成统一文本输出。
    formatOutput?: (result: unknown) => string
    // 为前端 tool part 预留展示配置。
    getDisplayConfig?: (args: TArgs) => ToolDisplayConfig
    // 确定性工具可将结果标记为高优先级事实来源。
    resultIsAuthoritative?: boolean
    // 用于按环境或功能开关决定当前工具是否可用。
    isAvailable?: () => boolean
}

export interface ChatToolRegistry {
    list(): ChatToolDefinition[]
    listActive(): ChatToolDefinition[]
    get(name: string): ChatToolDefinition | undefined
}

export function createChatToolRegistry(toolDefinitions: ChatToolDefinition[]): ChatToolRegistry {
    const toolDefinitionMap = new Map(toolDefinitions.map(toolDefinition => [toolDefinition.name, toolDefinition]))

    return {
        // Registry 统一管理所有工具定义，运行时只通过这里列出和查询工具。
        list() {
            return toolDefinitions
        },
        listActive() {
            return toolDefinitions.filter(toolDefinition => toolDefinition.isAvailable?.() ?? true)
        },
        get(name: string) {
            return toolDefinitionMap.get(name)
        },
    }
}
