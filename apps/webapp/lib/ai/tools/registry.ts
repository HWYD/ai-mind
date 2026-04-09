import type { StructuredToolInterface } from '@langchain/core/tools'
import type { ZodType } from 'zod'

export type ToolOutputPartType = 'tool' | 'resource'
export type ToolSource = 'internal' | 'mcp'

export interface ToolExecutionResult {
    content: string
    metadata?: Record<string, unknown>
}

export interface ToolDisplayConfig {
    title?: string
    action?: string
    inputPreview?: string
}

export interface ResourceDisplayConfig {
    resourceName: string
    uri: string
}

export interface ResourceResultDisplay extends ResourceDisplayConfig {
    contentPreview?: string
    isTruncated?: boolean
    previewChars?: number
}

export interface ChatToolDefinition<TArgs = unknown> {
    // 工具的唯一标识，用于与模型返回的 tool name 做运行时映射。
    name: string
    // LangChain 的工具实例，承载实际执行逻辑。
    tool: StructuredToolInterface
    // 入参校验 schema。
    schema: ZodType<TArgs>
    // 在执行 schema 校验前，对模型参数做一次归一化。
    normalizeArgs?: (args: unknown) => unknown
    // 参数校验通过后，格式化给前端展示的输入文本。
    formatInput?: (args: TArgs) => string
    // 将工具原始结果转成统一文本；默认会写入 ToolMessage，也可用于最终回答。
    formatOutput?: (result: unknown) => string
    // 为前端 tool part 生成展示配置。
    getDisplayConfig?: (args: TArgs) => ToolDisplayConfig
    // 为 resource-start / resource-error 生成最小展示信息。
    getResourceDisplayConfig?: (args: TArgs) => ResourceDisplayConfig
    // 将工具执行结果映射成 ResourcePart 需要的数据。
    getResourceResult?: (args: TArgs, result: unknown) => ResourceResultDisplay | null
    // 标记当前工具更适合渲染为 tool 还是 resource。
    outputPartType?: ToolOutputPartType
    // 标记工具来源，前端可据此展示内建 / MCP。
    source?: ToolSource
    // MCP 工具或资源对应的 serverId，内建工具可省略。
    serverId?: string
    // 确认工具结果可直接作为高优先级最终答案。
    resultIsAuthoritative?: boolean
    // 按需做能力开关判断，决定当前工具是否可用。
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
        // Registry 统一管理工具定义；运行时只通过列表与名称查询能力。
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
