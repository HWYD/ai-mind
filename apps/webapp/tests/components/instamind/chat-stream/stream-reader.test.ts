/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

import { consumeNdjsonStream } from '@/components/instamind/chat-stream/stream-reader'

function createTextStream(content: string) {
    const encoder = new TextEncoder()

    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(encoder.encode(content))
            controller.close()
        },
    })
}

describe('consumeNdjsonStream', () => {
    it('非法 JSON 行会收口成统一的流式解析错误', async () => {
        await expect(consumeNdjsonStream(createTextStream('{bad json}\n'), vi.fn())).rejects.toThrow('服务端返回了无法解析的流式数据。')
    })

    it('schema 不匹配的 JSON 行会收口成统一的流式解析错误', async () => {
        await expect(consumeNdjsonStream(createTextStream('{"type":"unknown"}\n'), vi.fn())).rejects.toThrow(
            '服务端返回了无法解析的流式数据。'
        )
    })
})
