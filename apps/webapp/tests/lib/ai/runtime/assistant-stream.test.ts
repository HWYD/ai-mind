import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { AIMessageChunk } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'

import { streamAssistantParts, streamPlanningResponse } from '@/lib/ai/runtime/assistant-stream'

async function* toAsyncChunks(chunks: AIMessageChunk[]) {
    for (const chunk of chunks) {
        yield chunk
    }
}

describe('assistant-stream', () => {
    it('关闭深度思考时不写出 reasoning chunk', async () => {
        const writtenChunks: ChatStreamChunk[] = []

        await streamAssistantParts(
            toAsyncChunks([
                new AIMessageChunk({
                    content: '最终答案',
                    additional_kwargs: {
                        reasoning_content: '这里是思考过程',
                    },
                }),
            ]),
            {},
            chunk => writtenChunks.push(chunk),
            () => false,
            false
        )

        expect(writtenChunks.map(chunk => chunk.type)).toEqual(['text-start', 'text-delta', 'text-end'])
    })

    it('planning 阶段关闭深度思考时会清理 reasoning metadata', async () => {
        const writtenChunks: ChatStreamChunk[] = []

        const response = await streamPlanningResponse(
            toAsyncChunks([
                new AIMessageChunk({
                    content: '先调用工具',
                    additional_kwargs: {
                        reasoning_content: '这里是规划思考',
                        trace_id: 'trace-1',
                    },
                }),
            ]),
            {},
            chunk => writtenChunks.push(chunk),
            () => false,
            false
        )

        expect(writtenChunks.map(chunk => chunk.type)).toEqual(['text-start', 'text-delta', 'text-end'])
        expect(response.additional_kwargs?.reasoning_content).toBeUndefined()
        expect(response.additional_kwargs?.trace_id).toBe('trace-1')
    })
})
