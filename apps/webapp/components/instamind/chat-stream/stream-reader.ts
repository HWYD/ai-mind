import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { chatStreamChunkSchema, type ChatStreamEventEnvelope, chatStreamLineSchema } from '@/lib/ai/stream-chunk-schema'

const streamParseErrorMessage = '服务端返回了无法解析的流式数据。'

export interface ConsumedStreamCursor {
    eventId: string
    lastAcknowledgedSequence: number
    protocolVersion: number
    runId: string
}

export interface ConsumeNdjsonStreamOptions {
    onCursor?: (cursor: ConsumedStreamCursor) => void
    onEnvelope?: (envelope: ChatStreamEventEnvelope) => void
    shouldApplyEnvelope?: (envelope: ChatStreamEventEnvelope) => boolean
}

function parseChatStreamLine(line: string): ChatStreamEventEnvelope {
    let parsedJson: unknown

    try {
        parsedJson = JSON.parse(line)
    } catch {
        throw new Error(streamParseErrorMessage)
    }

    const parsedLine = chatStreamLineSchema.safeParse(parsedJson)

    if (!parsedLine.success) {
        throw new Error(streamParseErrorMessage)
    }

    return parsedLine.data
}

function consumeParsedLine(
    parsedLine: ChatStreamEventEnvelope,
    onChunk: (chunk: ChatStreamChunk) => void,
    options: ConsumeNdjsonStreamOptions
) {
    options.onEnvelope?.(parsedLine)

    if (options.shouldApplyEnvelope && !options.shouldApplyEnvelope(parsedLine)) {
        return
    }

    if (parsedLine.payload.type !== 'run-status') {
        const parsedPayload = chatStreamChunkSchema.parse(parsedLine.payload)
        onChunk(parsedPayload as ChatStreamChunk)
    }

    options.onCursor?.({
        eventId: parsedLine.eventId,
        lastAcknowledgedSequence: parsedLine.sequence,
        protocolVersion: parsedLine.protocolVersion,
        runId: parsedLine.runId,
    })
}

export async function consumeNdjsonStream(
    stream: ReadableStream<Uint8Array>,
    onChunk: (chunk: ChatStreamChunk) => void,
    options: ConsumeNdjsonStreamOptions = {}
) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // 按 NDJSON 协议逐行消费流，避免把半截 JSON 提前交给解析层。
    while (true) {
        const { done, value } = await reader.read()

        if (done) {
            break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
            const trimmedLine = line.trim()

            if (!trimmedLine) {
                continue
            }

            consumeParsedLine(parseChatStreamLine(trimmedLine), onChunk, options)
        }
    }

    const finalLine = buffer.trim()

    if (!finalLine) {
        return
    }

    consumeParsedLine(parseChatStreamLine(finalLine), onChunk, options)
}
