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

    const issueMessage = error.issues.map(issue => issue.message).join('；')

    return `模型生成的 ${toolCall.name} 工具参数不合法：${issueMessage || '请检查 tool call 参数。'}`
}
