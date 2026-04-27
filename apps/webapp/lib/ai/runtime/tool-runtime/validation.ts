import { AIMessage, type ToolCall } from '@langchain/core/messages'
import { ZodError } from 'zod'

import { createId } from '@/lib/ai/create-id'
import { chatToolRegistry } from '@/lib/ai/tools'

import type { ToolValidationResult } from '../types'
import { formatToolInput, getResourceDisplayFields, getToolDisplayFields } from './display'

/**
 * 对模型返回的 tool calls 做统一归一化与 schema 校验，拆分成：
 * 1. 可执行调用
 * 2. 可展示校验错误
 */
export function normalizeAndValidateToolCalls(message: AIMessage): ToolValidationResult {
    const validatedToolCalls: ToolCall[] = []
    const toolErrors: ToolValidationResult['toolErrors'] = []

    for (const rawToolCall of message.tool_calls ?? []) {
        const toolCall = {
            ...rawToolCall,
            id: rawToolCall.id ?? createId(),
        }

        const toolDefinition = chatToolRegistry.get(toolCall.name)
        const displayFields = getToolDisplayFields(toolCall)
        const resourceDisplayFields = displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall) : undefined

        if (!toolDefinition) {
            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                input: formatToolInput(toolCall),
                message: '工具 ' + toolCall.name + ' 未注册。',
                outputPartType: displayFields.outputPartType,
                resourceName: resourceDisplayFields?.resourceName,
                serverId: displayFields.serverId,
                source: displayFields.source,
                location: displayFields.location,
                uri: resourceDisplayFields?.uri,
            })
            continue
        }

        const normalizedArgs = toolDefinition.normalizeArgs ? toolDefinition.normalizeArgs(toolCall.args) : toolCall.args
        const parsedArgs = toolDefinition.schema.safeParse(normalizedArgs)

        if (!parsedArgs.success) {
            const normalizedToolCall = {
                ...toolCall,
                args: normalizedArgs,
            }
            const normalizedDisplayFields = getToolDisplayFields(normalizedToolCall)
            const normalizedResourceDisplayFields =
                normalizedDisplayFields.outputPartType === 'resource' ? getResourceDisplayFields(normalizedToolCall) : undefined

            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: normalizedDisplayFields.title,
                action: normalizedDisplayFields.action,
                input: formatToolInput(normalizedToolCall),
                message: createToolValidationErrorMessage(toolCall, parsedArgs.error),
                outputPartType: normalizedDisplayFields.outputPartType,
                resourceName: normalizedResourceDisplayFields?.resourceName,
                serverId: normalizedDisplayFields.serverId,
                source: normalizedDisplayFields.source,
                location: normalizedDisplayFields.location,
                uri: normalizedResourceDisplayFields?.uri,
            })
            continue
        }

        validatedToolCalls.push({
            ...toolCall,
            args: parsedArgs.data,
        })
    }

    if (validatedToolCalls.length === 0) {
        return {
            planningMessage: message,
            toolCalls: validatedToolCalls,
            toolErrors,
        }
    }

    return {
        planningMessage: new AIMessage({
            id: message.id,
            content: '',
            additional_kwargs: message.additional_kwargs,
            response_metadata: message.response_metadata,
            usage_metadata: message.usage_metadata,
            tool_calls: validatedToolCalls,
            invalid_tool_calls: message.invalid_tool_calls,
        }),
        toolCalls: validatedToolCalls,
        toolErrors,
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
