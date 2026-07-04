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

    it('只累计可见文本，忽略混入 content 数组中的非文本中间 parts', async () => {
        const writtenChunks: ChatStreamChunk[] = []

        const completedText = await streamAssistantParts(
            toAsyncChunks([
                new AIMessageChunk({
                    content: [
                        { type: 'text', text: '最终回答第一段。' },
                        { type: 'tool_result', value: { raw: true } },
                        { type: 'text', text: '最终回答第二段。' },
                    ],
                }),
            ]),
            {},
            chunk => writtenChunks.push(chunk),
            () => false,
            false
        )

        expect(completedText).toBe('最终回答第一段。最终回答第二段。')
        expect(writtenChunks).toContainEqual(
            expect.objectContaining({
                type: 'text-delta',
                delta: '最终回答第一段。最终回答第二段。',
            })
        )
    })
})
