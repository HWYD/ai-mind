import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'

function parseChatStreamLine(line: string): ChatStreamChunk {
    let parsedJson: unknown

    try {
        parsedJson = JSON.parse(line)
    } catch {
        throw new Error('服务端返回了无法解析的流式数据。')
    }

    const parsedChunk = chatStreamChunkSchema.safeParse(parsedJson)

    if (!parsedChunk.success) {
        throw new Error('服务端返回了无法解析的流式数据。')
    }

    return parsedChunk.data
}

export async function consumeNdjsonStream(stream: ReadableStream<Uint8Array>, onChunk: (chunk: ChatStreamChunk) => void) {
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

            onChunk(parseChatStreamLine(trimmedLine))
        }
    }

    const finalLine = buffer.trim()

    if (!finalLine) {
        return
    }

    onChunk(parseChatStreamLine(finalLine))
}
