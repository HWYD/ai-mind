import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPServerId } from '@/lib/ai/mcp/protocol/types'
import type { ChatToolDefinition } from '@/lib/ai/tools'

type RemoteToolMetadata = Awaited<ReturnType<typeof mcpClientManager.listTools>>['tools'][number]

interface JsonSchemaLike {
    description?: string
    enum?: unknown[]
    items?: JsonSchemaLike
    properties?: Record<string, JsonSchemaLike>
    required?: string[]
    type?: string
}

/**
 * 从 MCP tool 调用结果中提取可交给现有 Tool Runtime 展示和回填的文本。
 * 当前先只消费 text/structuredContent，避免 remote tool adapter 过早承担复杂内容协议。
 */
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
 * 把 MCP tools/list 暴露的最小 JSON Schema 转成 LangChain tool 可消费的 Zod schema。
 * 这里只覆盖当前 remote MCP MVP 需要的基础类型，复杂 schema 留到后续版本统一增强。
 */
function toZodSchema(schema: JsonSchemaLike | undefined): z.ZodTypeAny {
    if (!schema) {
        return z.unknown()
    }

    if (Array.isArray(schema.enum) && schema.enum.every(value => typeof value === 'string')) {
        const [firstValue, ...restValues] = schema.enum as [string, ...string[]]

        if (firstValue) {
            return z.enum([firstValue, ...restValues])
        }
    }

    switch (schema.type) {
        case 'array':
            return z.array(toZodSchema(schema.items))
        case 'boolean':
            return z.boolean()
        case 'integer':
            return z.number().int()
        case 'number':
            return z.number()
        case 'object': {
            const requiredFields = new Set(schema.required ?? [])
            const shape = Object.fromEntries(
                Object.entries(schema.properties ?? {}).map(([key, value]) => {
                    const propertySchema = toZodSchema(value)

                    return [key, requiredFields.has(key) ? propertySchema : propertySchema.optional()]
                })
            )

            return z.object(shape).passthrough()
        }
        case 'string':
            return z.string()
        default:
            return z.unknown()
    }
}

/**
 * 生成工具卡片中的输入摘要。
 * 保持简单 key=value 展示，和现有本地工具的 tool part 风格对齐。
 */
function formatRemoteToolInput(args: unknown) {
    if (!args || typeof args !== 'object') {
        return JSON.stringify(args ?? {}, null, 2)
    }

    const entries = Object.entries(args as Record<string, unknown>)

    if (entries.length === 0) {
        return '{}'
    }

    return entries.map(([key, value]) => `${key}=${String(value ?? '')}`).join(', ')
}

/**
 * 将单个 remote MCP tool 元数据适配成项目内部统一的 ChatToolDefinition。
 * 这样模型看到的是标准 tool，执行时仍由 MCP Client Manager 转发到对应 remote server。
 */
function createRemoteMcpToolDefinition(serverId: MCPServerId, toolMetadata: RemoteToolMetadata): ChatToolDefinition {
    const schema = toZodSchema(toolMetadata.inputSchema as JsonSchemaLike)
    const title = toolMetadata.title ?? toolMetadata.name

    return {
        name: toolMetadata.name,
        tool: tool(
            async args => {
                const toolArguments = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}

                const response = await mcpClientManager.callTool(serverId, {
                    name: toolMetadata.name,
                    arguments: toolArguments,
                })
                const outputText = extractToolText(response.result)

                if (response.result.isError) {
                    throw new MCPHostError('REQUEST_FAILED', outputText || `${toolMetadata.name} remote MCP Tool 调用失败。`)
                }

                if (!outputText) {
                    throw new MCPHostError('REQUEST_FAILED', `${toolMetadata.name} remote MCP Tool 没有返回可用文本结果。`)
                }

                return outputText
            },
            {
                name: toolMetadata.name,
                description: toolMetadata.description ?? `${toolMetadata.name} remote MCP Tool`,
                schema,
            }
        ),
        schema,
        formatInput: formatRemoteToolInput,
        getDisplayConfig: args => ({
            title,
            action: 'call',
            inputPreview: formatRemoteToolInput(args),
        }),
        source: 'mcp',
        serverId,
    }
}

/**
 * 列出指定 server 的 remote MCP tool definitions。
 * 这里不额外缓存，缓存与 close 失效统一交给 MCPClientManager 维护。
 */
async function listRemoteMcpToolDefinitions(serverId: MCPServerId) {
    const response = await mcpClientManager.listTools(serverId)

    return response.tools.map(toolMetadata => createRemoteMcpToolDefinition(serverId, toolMetadata))
}

export async function getRemoteMcpToolDefinitions(serverId: MCPServerId) {
    return listRemoteMcpToolDefinitions(serverId)
}

export async function getRemoteMcpToolDefinition(serverId: MCPServerId, toolName: string) {
    const toolDefinitions = await getRemoteMcpToolDefinitions(serverId)

    return toolDefinitions.find(toolDefinition => toolDefinition.name === toolName)
}
