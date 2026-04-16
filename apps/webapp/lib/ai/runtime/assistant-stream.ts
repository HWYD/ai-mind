import { AIMessage, AIMessageChunk, type ToolMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'

import { getMessageContentText } from './message-content'
import { logChatCancellation } from './stream-errors'
import type { ChatExecutionContext, WriteChunk } from './types'

function getChunkText(chunk: AIMessageChunk): string {
    return getMessageContentText(chunk.content)
}

function getMessageText(message: AIMessage | ToolMessage): string {
    return getMessageContentText(message.content)
}

function getReasoningText(source: { additional_kwargs?: Record<string, unknown> }): string {
    const reasoningContent = source.additional_kwargs?.reasoning_content

    if (typeof reasoningContent === 'string') {
        return reasoningContent
    }

    return ''
}

export async function streamAssistantParts(
    modelStream: AsyncIterable<AIMessageChunk>,
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    isClosed: () => boolean
) {
    let textStarted = false
    let reasoningStarted = false
    const textPartId = createId()
    const reasoningPartId = createId()

    const ensureTextPartStarted = () => {
        if (textStarted) {
            return
        }

        textStarted = true
        writeChunk({
            type: 'text-start',
            partId: textPartId,
        })
    }

    const ensureReasoningPartStarted = () => {
        if (reasoningStarted) {
            return
        }

        reasoningStarted = true
        writeChunk({
            type: 'reasoning-start',
            partId: reasoningPartId,
        })
    }

    for await (const chunk of modelStream) {
        if (context.signal?.aborted || isClosed()) {
            if (context.signal?.aborted) {
                logChatCancellation('request aborted by client')
            }
            return
        }

        const reasoning = getReasoningText(chunk)
        const text = getChunkText(chunk)

        if (reasoning) {
            ensureReasoningPartStarted()
            writeChunk({
                type: 'reasoning-delta',
                partId: reasoningPartId,
                delta: reasoning,
            })
        }

        if (text) {
            ensureTextPartStarted()
            writeChunk({
                type: 'text-delta',
                partId: textPartId,
                delta: text,
            })
        }
    }

    if (reasoningStarted) {
        writeChunk({
            type: 'reasoning-end',
            partId: reasoningPartId,
        })
    }

    if (textStarted) {
        writeChunk({
            type: 'text-end',
            partId: textPartId,
        })
    }
}

function toAIMessage(chunk: AIMessageChunk | null): AIMessage {
    if (!chunk) {
        return new AIMessage({
            content: '',
            tool_calls: [],
            invalid_tool_calls: [],
        })
    }

    return new AIMessage({
        id: chunk.id,
        content: chunk.content,
        additional_kwargs: chunk.additional_kwargs,
        response_metadata: chunk.response_metadata,
        usage_metadata: chunk.usage_metadata,
        tool_calls: chunk.tool_calls,
        invalid_tool_calls: chunk.invalid_tool_calls,
    })
}

// 第一阶段会一边流式写出规划阶段的文本/推理，一边累计完整的 AIMessage。
// 一旦出现 tool call，就停止继续透传正文文本，但仍保留推理输出用于排障与观察。
export async function streamPlanningResponse(
    modelStream: AsyncIterable<AIMessageChunk>,
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    isClosed: () => boolean
) {
    let combinedChunk: AIMessageChunk | null = null
    let textStarted = false
    let reasoningStarted = false
    let encounteredToolCall = false
    const textPartId = createId()
    const reasoningPartId = createId()

    const ensureTextPartStarted = () => {
        if (textStarted) {
            return
        }

        textStarted = true
        writeChunk({
            type: 'text-start',
            partId: textPartId,
        })
    }

    const ensureReasoningPartStarted = () => {
        if (reasoningStarted) {
            return
        }

        reasoningStarted = true
        writeChunk({
            type: 'reasoning-start',
            partId: reasoningPartId,
        })
    }

    for await (const chunk of modelStream) {
        if (context.signal?.aborted || isClosed()) {
            if (context.signal?.aborted) {
                logChatCancellation('request aborted by client')
            }
            return toAIMessage(combinedChunk)
        }

        combinedChunk = combinedChunk ? combinedChunk.concat(chunk) : chunk

        const reasoning = getReasoningText(chunk)

        if (reasoning) {
            ensureReasoningPartStarted()
            writeChunk({
                type: 'reasoning-delta',
                partId: reasoningPartId,
                delta: reasoning,
            })
        }

        if (chunk.tool_call_chunks?.length || chunk.tool_calls?.length) {
            encounteredToolCall = true
        }

        const text = getChunkText(chunk)

        if (!encounteredToolCall && text) {
            ensureTextPartStarted()
            writeChunk({
                type: 'text-delta',
                partId: textPartId,
                delta: text,
            })
        }
    }

    if (reasoningStarted) {
        writeChunk({
            type: 'reasoning-end',
            partId: reasoningPartId,
        })
    }

    if (textStarted) {
        writeChunk({
            type: 'text-end',
            partId: textPartId,
        })
    }

    return toAIMessage(combinedChunk)
}

export function stripMessageText(message: AIMessage) {
    return new AIMessage({
        id: message.id,
        content: '',
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
        usage_metadata: message.usage_metadata,
        tool_calls: message.tool_calls,
        invalid_tool_calls: message.invalid_tool_calls,
    })
}

export function hasVisibleAssistantText(message: AIMessage) {
    return getMessageText(message).trim().length > 0
}
