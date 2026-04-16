import { type ToolCall, ToolMessage } from '@langchain/core/messages'

import { type ChatToolDefinition, chatToolRegistry } from '@/lib/ai/tools'

import { getMessageContentText } from '../message-content'

const DEFAULT_RESOURCE_PREVIEW_CHARS = 3000
const DEFAULT_RESOURCE_URI = 'resource://unknown'

export interface ToolDisplayFields {
    title?: string
    action?: string
    outputPartType: 'resource' | 'tool'
    source: 'internal' | 'mcp'
    serverId?: string
}

export interface ResourceDisplayFields {
    resourceName: string
    uri: string
}

function normalizePreviewChars(value: number | undefined) {
    if (!value || !Number.isFinite(value)) {
        return DEFAULT_RESOURCE_PREVIEW_CHARS
    }

    return Math.max(1, Math.floor(value))
}

/**
 * 统一格式化模型传回参数，优先走工具自身声明的 formatInput。
 */
export function formatToolInput(toolCall: ToolCall) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        return toolDefinition?.formatInput ? toolDefinition.formatInput(toolCall.args) : JSON.stringify(toolCall.args)
    } catch {
        return JSON.stringify(toolCall.args)
    }
}

/**
 * 从工具定义读取展示字段，任何展示配置异常都兜底，避免影响主链执行。
 */
export function getToolDisplayFields(toolCall: ToolCall): ToolDisplayFields {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        const displayConfig = toolDefinition?.getDisplayConfig?.(toolCall.args)

        return {
            title: displayConfig?.title,
            action: displayConfig?.action,
            outputPartType: toolDefinition?.outputPartType ?? 'tool',
            source: toolDefinition?.source ?? 'internal',
            serverId: toolDefinition?.serverId,
        }
    } catch {
        return {
            title: toolCall.name,
            action:
                typeof toolCall.args === 'object' && toolCall.args && 'action' in toolCall.args
                    ? String((toolCall.args as { action?: unknown }).action)
                    : undefined,
            outputPartType: toolDefinition?.outputPartType ?? 'tool',
            source: toolDefinition?.source ?? 'internal',
            serverId: toolDefinition?.serverId,
        }
    }
}

/**
 * 生成资源类型输出的基础展示字段，未配置时使用安全兜底值。
 */
export function getResourceDisplayFields(toolCall: ToolCall): ResourceDisplayFields {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        const resourceDisplayConfig = toolDefinition?.getResourceDisplayConfig?.(toolCall.args)
        const toolDisplayConfig = toolDefinition?.getDisplayConfig?.(toolCall.args)

        return {
            resourceName: resourceDisplayConfig?.resourceName ?? toolDisplayConfig?.title ?? toolCall.name,
            uri: resourceDisplayConfig?.uri ?? DEFAULT_RESOURCE_URI,
        }
    } catch {
        return {
            resourceName: toolCall.name,
            uri: DEFAULT_RESOURCE_URI,
        }
    }
}

/**
 * 把工具结果转换成 Resource 卡片字段；若工具未提供结构化结果则退化为文本预览。
 */
export function getResourceResultFields(toolCall: ToolCall, result: unknown, output: string) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    if (toolDefinition?.getResourceResult) {
        const resourceResult = toolDefinition.getResourceResult(toolCall.args, result)

        if (resourceResult) {
            return resourceResult
        }
    }

    const displayFields = getResourceDisplayFields(toolCall)
    const previewChars = normalizePreviewChars(toolDefinition?.resourcePreviewChars)

    return {
        resourceName: displayFields.resourceName,
        uri: displayFields.uri,
        contentPreview: output.slice(0, previewChars),
        isTruncated: output.length > previewChars,
        previewChars,
    }
}

/**
 * 把工具执行结果统一转成文本，保证后续展示和 ToolMessage 输入稳定。
 */
export function formatToolExecutionOutput(toolDefinition: ChatToolDefinition, result: unknown) {
    if (toolDefinition.formatOutput) {
        return toolDefinition.formatOutput(result)
    }

    if (typeof result === 'string') {
        return result
    }

    if (ToolMessage.isInstance(result)) {
        return getMessageContentText(result.content)
    }

    return JSON.stringify(result)
}
