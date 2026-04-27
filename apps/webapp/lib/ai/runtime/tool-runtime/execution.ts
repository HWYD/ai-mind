import type { StreamErrorStage } from '@ai-mind/stream-core/protocol'
import { type ToolCall, ToolMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import { isAbortError } from '@/lib/ai/error-utils'
import { chatToolRegistry } from '@/lib/ai/tools'

import { throwIfAborted, writeStreamErrorChunk } from '../stream-errors'
import type { ChatExecutionContext, ExecutedToolResult, ToolValidationError, WriteChunk } from '../types'
import {
    formatToolExecutionOutput,
    formatToolInput,
    getResourceDisplayFields,
    getResourceResultFields,
    getToolDisplayFields,
    type ResourceDisplayFields,
    type ToolDisplayFields,
} from './display'

interface ExecuteToolCallOptions {
    errorStage?: StreamErrorStage
}

interface ToolExecutionErrorOptions {
    displayFields: ToolDisplayFields
    input: string
    message: string
    partId: string
    resourceDisplayFields?: ResourceDisplayFields
    stage?: StreamErrorStage
    toolCall: ToolCall
    writeChunk: WriteChunk
}

interface ToolValidationErrorWriteOptions {
    stage?: StreamErrorStage
    writeChunk: WriteChunk
}

function writeToolExecutionError(options: ToolExecutionErrorOptions) {
    const resourceServerId = options.displayFields.serverId ?? 'mcp-resource'

    if (options.displayFields.outputPartType === 'resource' && options.resourceDisplayFields) {
        writeStreamErrorChunk(options.writeChunk, {
            scope: 'resource',
            errorCode: 'TOOL_EXECUTION_FAILED',
            retryable: false,
            message: options.message,
            stage: options.stage,
            partId: options.partId,
            resourceName: options.resourceDisplayFields.resourceName,
            uri: options.resourceDisplayFields.uri,
            source: options.displayFields.source,
            location: options.displayFields.location,
            serverId: resourceServerId,
        })
        return
    }

    writeStreamErrorChunk(options.writeChunk, {
        scope: 'tool',
        errorCode: 'TOOL_EXECUTION_FAILED',
        retryable: false,
        message: options.message,
        stage: options.stage,
        partId: options.partId,
        toolName: options.toolCall.name,
        source: options.displayFields.source,
        location: options.displayFields.location,
        serverId: options.displayFields.serverId,
        input: options.input,
    })
}

export function writeToolValidationErrors(toolErrors: ToolValidationError[], options: ToolValidationErrorWriteOptions) {
    return toolErrors.map(toolError => {
        const partId = createId()

        if (toolError.outputPartType === 'resource') {
            options.writeChunk({
                type: 'resource-start',
                partId,
                resourceName: toolError.resourceName ?? toolError.toolName,
                uri: toolError.uri ?? 'resource://unknown',
                source: toolError.source,
                location: toolError.location,
                serverId: toolError.serverId ?? 'mcp-resource',
            })
            writeStreamErrorChunk(options.writeChunk, {
                scope: 'resource',
                errorCode: 'TOOL_VALIDATION_FAILED',
                retryable: false,
                message: toolError.message,
                stage: options.stage,
                partId,
                resourceName: toolError.resourceName ?? toolError.toolName,
                uri: toolError.uri ?? 'resource://unknown',
                source: toolError.source,
                location: toolError.location,
                serverId: toolError.serverId ?? 'mcp-resource',
            })
        } else {
            options.writeChunk({
                type: 'tool-start',
                partId,
                toolName: toolError.toolName,
                title: toolError.title,
                action: toolError.action,
                source: toolError.source,
                location: toolError.location,
                serverId: toolError.serverId,
                input: toolError.input,
            })
            writeStreamErrorChunk(options.writeChunk, {
                scope: 'tool',
                errorCode: 'TOOL_VALIDATION_FAILED',
                retryable: false,
                message: toolError.message,
                stage: options.stage,
                partId,
                toolName: toolError.toolName,
                source: toolError.source,
                location: toolError.location,
                serverId: toolError.serverId,
                input: toolError.input,
            })
        }

        return new ToolMessage({
            content: toolError.message,
            tool_call_id: toolError.id,
            status: 'error',
            metadata: {
                toolName: toolError.toolName,
            },
        })
    })
}

export async function executeToolCall(
    toolCall: ToolCall,
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    options: ExecuteToolCallOptions = {}
): Promise<ExecutedToolResult> {
    // 执行前先做取消检查，避免已取消请求继续调用外部能力。
    throwIfAborted(context.signal)

    const toolDefinition = chatToolRegistry.get(toolCall.name)
    const partId = createId()
    const input = formatToolInput(toolCall)
    const displayFields = getToolDisplayFields(toolCall)
    const resourceDisplayFields = displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall) : undefined
    const resourceServerId = displayFields.serverId ?? 'mcp-resource'

    if (displayFields.outputPartType === 'resource' && resourceDisplayFields) {
        writeChunk({
            type: 'resource-start',
            partId,
            resourceName: resourceDisplayFields.resourceName,
            uri: resourceDisplayFields.uri,
            source: displayFields.source,
            location: displayFields.location,
            serverId: resourceServerId,
        })
    } else {
        writeChunk({
            type: 'tool-start',
            partId,
            toolName: toolCall.name,
            title: displayFields.title,
            action: displayFields.action,
            source: displayFields.source,
            location: displayFields.location,
            serverId: displayFields.serverId,
            input,
        })
    }

    if (!toolDefinition) {
        const message = '工具 ' + toolCall.name + ' 未注册。'

        writeToolExecutionError({
            displayFields,
            input,
            message,
            partId,
            resourceDisplayFields,
            stage: options.errorStage,
            toolCall,
            writeChunk,
        })

        const toolMessage = new ToolMessage({
            content: message,
            tool_call_id: toolCall.id ?? createId(),
            status: 'error',
            metadata: {
                toolName: toolCall.name,
            },
        })

        return {
            toolCall,
            toolMessage,
            output: message,
            success: false,
        }
    }

    try {
        const result = await toolDefinition.tool.invoke(
            {
                type: 'tool_call',
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.args,
            },
            {
                signal: context.signal,
            }
        )

        const output = formatToolExecutionOutput(toolDefinition, result)
        const toolMessage = ToolMessage.isInstance(result)
            ? result
            : new ToolMessage({
                  content: output,
                  tool_call_id: toolCall.id ?? createId(),
                  status: 'success',
                  metadata: {
                      toolName: toolCall.name,
                  },
              })

        if (displayFields.outputPartType === 'resource') {
            const resourceResultFields = getResourceResultFields(toolCall, result, output)

            writeChunk({
                type: 'resource-end',
                partId,
                resourceName: resourceResultFields.resourceName,
                uri: resourceResultFields.uri,
                source: displayFields.source,
                location: displayFields.location,
                serverId: resourceServerId,
                contentPreview: resourceResultFields.contentPreview,
                isTruncated: resourceResultFields.isTruncated,
                previewChars: resourceResultFields.previewChars,
            })
        } else {
            writeChunk({
                type: 'tool-end',
                partId,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                source: displayFields.source,
                location: displayFields.location,
                serverId: displayFields.serverId,
                input,
                output,
            })
        }

        return {
            toolCall,
            toolMessage,
            output,
            success: true,
        }
    } catch (error) {
        if (isAbortError(error) || context.signal?.aborted) {
            throw error
        }

        const message = error instanceof Error ? error.message : '工具执行失败。'

        writeToolExecutionError({
            displayFields,
            input,
            message,
            partId,
            resourceDisplayFields,
            stage: options.errorStage,
            toolCall,
            writeChunk,
        })

        const toolMessage = new ToolMessage({
            content: message,
            tool_call_id: toolCall.id ?? createId(),
            status: 'error',
            metadata: {
                toolName: toolCall.name,
            },
        })

        return {
            toolCall,
            toolMessage,
            output: message,
            success: false,
        }
    }
}
