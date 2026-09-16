import type { StructuredToolInterface } from '@langchain/core/tools'
import { z, type ZodType } from 'zod'

export type ToolOutputPartType = 'tool' | 'resource'
export type ToolSource = 'internal' | 'mcp'
export const toolRuntimeScopes = ['skill-binding', 'delivery-chain-manager', 'general-react-agent', 'version-plan-tasklist-agent'] as const
export type ToolRuntimeScope = (typeof toolRuntimeScopes)[number]

export const toolExecutionProfiles = Object.freeze({
    'local-deterministic': Object.freeze({
        maxAttemptTimeoutMs: 5000,
        maxRetriesPerCall: 0,
    }),
    'remote-readonly': Object.freeze({
        maxAttemptTimeoutMs: 20000,
        maxRetriesPerCall: 2,
    }),
})

const standardToolExecutionPolicySchema = z
    .object({
        attemptTimeoutMs: z.number().int().positive().optional(),
        kind: z.literal('standard-tool'),
        profile: z.enum(['local-deterministic', 'remote-readonly']),
        retrySafe: z.boolean(),
    })
    .strict()
    .superRefine((policy, context) => {
        if (policy.attemptTimeoutMs && policy.attemptTimeoutMs > toolExecutionProfiles[policy.profile].maxAttemptTimeoutMs) {
            context.addIssue({
                code: 'custom',
                message: `${policy.profile} attemptTimeoutMs 超过 Profile 上限。`,
                path: ['attemptTimeoutMs'],
            })
        }
    })

const agentToolExecutionPolicySchema = z
    .object({
        kind: z.literal('agent-tool'),
        profile: z.literal('delegated-agent'),
    })
    .strict()

export const toolExecutionPolicySchema = z.union([standardToolExecutionPolicySchema, agentToolExecutionPolicySchema])
export type ToolExecutionPolicy = z.infer<typeof toolExecutionPolicySchema>

export function parseToolExecutionPolicy(input: unknown): ToolExecutionPolicy {
    return toolExecutionPolicySchema.parse(input)
}

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
    // 服务端 Tool Runtime 执行策略；不进入模型可填写的参数 schema。
    executionPolicy: ToolExecutionPolicy
    // 在执行 schema 校验前，对模型参数做一次归一化。
    normalizeArgs?: (args: unknown) => unknown
    // 参数校验通过后，格式化给前端展示的输入文本。
    formatInput?: (args: TArgs) => string
    // 将工具原始结果转成统一文本；默认会写入 ToolMessage，也可用于最终回答。
    formatOutput?: (result: unknown) => string
    // 将工具结果转成可公开展示的安全摘要；不得默认复用完整内部 observation。
    formatPublicOutput?: (result: unknown) => string
    // 为前端 tool part 生成展示配置。
    getDisplayConfig?: (args: TArgs) => ToolDisplayConfig
    // 为 resource-start / error(scope=resource) 生成最小展示信息。
    getResourceDisplayConfig?: (args: TArgs) => ResourceDisplayConfig
    // 将工具执行结果映射成 ResourcePart 需要的数据。
    getResourceResult?: (args: TArgs, result: unknown) => ResourceResultDisplay | null
    // 当 resource 结果未提供结构化预览时，指定 runtime 退化预览的最大字符数。
    resourcePreviewChars?: number
    // 标记当前工具更适合渲染为 tool 还是 resource。
    outputPartType?: ToolOutputPartType
    // 标记工具来源，前端可据此展示内建 / MCP。
    source?: ToolSource
    // MCP 工具或资源对应的 serverId，内建工具可省略。
    serverId?: string
    // 标记当前工具允许被哪些 runtime 作用域消费；未声明时默认进入 skill-binding。
    runtimeScopes?: ToolRuntimeScope[]
    // 确认工具结果可直接作为高优先级最终答案。
    resultIsAuthoritative?: boolean
    // 按需做能力开关判断，决定当前工具是否可用。
    isAvailable?: () => boolean
}

export interface ChatToolRegistry {
    list(): ChatToolDefinition[]
    listActive(): ChatToolDefinition[]
    listByRuntimeScope(scope: ToolRuntimeScope): ChatToolDefinition[]
    listActiveByRuntimeScope(scope: ToolRuntimeScope): ChatToolDefinition[]
    get(name: string): ChatToolDefinition | undefined
}

export function toolSupportsRuntimeScope(toolDefinition: ChatToolDefinition, scope: ToolRuntimeScope) {
    if (!toolDefinition.runtimeScopes || toolDefinition.runtimeScopes.length === 0) {
        return scope === 'skill-binding'
    }

    return toolDefinition.runtimeScopes.includes(scope)
}

export function createChatToolRegistry(toolDefinitions: ChatToolDefinition[]): ChatToolRegistry {
    const toolDefinitionMap = new Map<string, ChatToolDefinition>()

    for (const toolDefinition of toolDefinitions) {
        parseToolExecutionPolicy(toolDefinition.executionPolicy)

        if (toolDefinitionMap.has(toolDefinition.name)) {
            throw new Error(`Tool Registry 存在重复工具名：${toolDefinition.name}`)
        }

        toolDefinitionMap.set(toolDefinition.name, toolDefinition)
    }

    return {
        // Registry 统一管理工具定义；运行时只通过列表与名称查询能力。
        list() {
            return toolDefinitions
        },
        listActive() {
            return toolDefinitions.filter(toolDefinition => toolDefinition.isAvailable?.() ?? true)
        },
        listByRuntimeScope(scope: ToolRuntimeScope) {
            return toolDefinitions.filter(toolDefinition => toolSupportsRuntimeScope(toolDefinition, scope))
        },
        listActiveByRuntimeScope(scope: ToolRuntimeScope) {
            return toolDefinitions.filter(
                toolDefinition => toolSupportsRuntimeScope(toolDefinition, scope) && (toolDefinition.isAvailable?.() ?? true)
            )
        },
        get(name: string) {
            return toolDefinitionMap.get(name)
        },
    }
}
