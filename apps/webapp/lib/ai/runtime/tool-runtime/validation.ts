import type { ToolCall } from '@langchain/core/messages'
import { ZodError } from 'zod'

import { createId } from '@/lib/ai/create-id'

import type { ToolValidationError } from '../types'
import { formatToolInput, getResourceDisplayFields, getToolDisplayFields, type ToolDefinitionMap } from './display'

export type SingleToolCallValidationResult =
    | {
          success: true
          toolCall: ToolCall
      }
    | {
          success: false
          toolError: ToolValidationError
      }

/**
 * 单个 Tool Call 的统一边界：先补 ID，再 normalize，最后只放行 schema 解析后的参数。
 */
export function normalizeAndValidateToolCall(rawToolCall: ToolCall, toolDefinitionMap: ToolDefinitionMap): SingleToolCallValidationResult {
    const toolCall = {
        ...rawToolCall,
        id: rawToolCall.id ?? createId(),
    }
    const toolDefinition = toolDefinitionMap.get(toolCall.name)
    const displayFields = getToolDisplayFields(toolCall, toolDefinitionMap)
    const resourceDisplayFields =
        displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall, toolDefinitionMap) : undefined

    if (!toolDefinition) {
        return {
            success: false,
            toolError: {
                action: displayFields.action,
                id: toolCall.id,
                input: formatToolInput(toolCall, toolDefinitionMap),
                location: displayFields.location,
                message: '工具 ' + toolCall.name + ' 未注册。',
                outputPartType: displayFields.outputPartType,
                resourceName: resourceDisplayFields?.resourceName,
                serverId: displayFields.serverId,
                source: displayFields.source,
                title: displayFields.title,
                toolName: toolCall.name,
                uri: resourceDisplayFields?.uri,
            },
        }
    }

    const normalizedArgs = toolDefinition.normalizeArgs ? toolDefinition.normalizeArgs(toolCall.args) : toolCall.args
    const parsedArgs = toolDefinition.schema.safeParse(normalizedArgs)

    if (!parsedArgs.success) {
        const normalizedToolCall = {
            ...toolCall,
            args: normalizedArgs,
        }
        const normalizedDisplayFields = getToolDisplayFields(normalizedToolCall, toolDefinitionMap)
        const normalizedResourceDisplayFields =
            normalizedDisplayFields.outputPartType === 'resource'
                ? getResourceDisplayFields(normalizedToolCall, toolDefinitionMap)
                : undefined

        return {
            success: false,
            toolError: {
                action: normalizedDisplayFields.action,
                id: toolCall.id,
                input: formatToolInput(normalizedToolCall, toolDefinitionMap),
                location: normalizedDisplayFields.location,
                message: createToolValidationErrorMessage(toolCall, parsedArgs.error),
                outputPartType: normalizedDisplayFields.outputPartType,
                resourceName: normalizedResourceDisplayFields?.resourceName,
                serverId: normalizedDisplayFields.serverId,
                source: normalizedDisplayFields.source,
                title: normalizedDisplayFields.title,
                toolName: toolCall.name,
                uri: normalizedResourceDisplayFields?.uri,
            },
        }
    }

    return {
        success: true,
        toolCall: {
            ...toolCall,
            args: parsedArgs.data,
        },
    }
}

/**
 * 将 schema 校验错误整理成前端可读文案，避免暴露难懂的原始错误结构。
 */
function createToolValidationErrorMessage(toolCall: ToolCall, error: ZodError | string) {
    if (typeof error === 'string') {
        return error
    }

    const issueMessage = [...new Set(error.issues.map(toSafeValidationIssueMessage))].join('；')

    return `工具参数校验失败：${issueMessage || '请检查调用参数。'}。请按 schema 调整后重新调用。`
}

function toSafeValidationIssueMessage(issue: ZodError['issues'][number]) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '参数'
    const code = String(issue.code)

    switch (code) {
        case 'invalid_type':
            return `${field} 缺失或类型不正确`
        case 'unrecognized_keys':
            return '包含 schema 未允许的字段'
        case 'too_small':
        case 'too_big':
            return `${field} 不符合长度或范围限制`
        case 'invalid_format':
        case 'invalid_string':
            return `${field} 格式不正确`
        default:
            return `${field} 不符合 schema 约束`
    }
}
