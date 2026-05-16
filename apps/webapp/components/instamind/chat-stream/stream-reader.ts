import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'

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

            const parsedChunk = chatStreamChunkSchema.safeParse(JSON.parse(trimmedLine))

            if (!parsedChunk.success) {
                throw new Error('服务端返回了无法解析的流式数据。')
            }

            onChunk(parsedChunk.data)
        }
    }

    const finalLine = buffer.trim()

    if (!finalLine) {
        return
    }

    const parsedChunk = chatStreamChunkSchema.safeParse(JSON.parse(finalLine))

    if (!parsedChunk.success) {
        throw new Error('服务端返回了无法解析的流式数据。')
    }

    onChunk(parsedChunk.data)
}
