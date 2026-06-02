import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { describe, expect, it } from 'vitest'

import {
    createStreamMessageState,
    reduceStreamChunk,
    reduceStreamTextDeltas,
    type StreamMessageState,
} from '@/components/instamind/chat-stream/stream-message-reducer'

function reduceChunks(chunks: ChatStreamChunk[]) {
    return chunks.reduce((state, chunk) => reduceStreamChunk(state, chunk).state, createStreamMessageState())
}

function getAssistantMessage(state: StreamMessageState) {
    return state.messages.find(message => message.role === 'assistant')
}

describe('stream-message-reducer', () => {
    it('按 chunk 顺序聚合 text 与 tool part', () => {
        let state = reduceChunks([
            { type: 'start', messageId: 'assistant-1' },
            { type: 'text-start', partId: 'text-1' },
        ])

        state = reduceStreamTextDeltas(state, [
            {
                delta: '先输出正文。',
                messageId: 'assistant-1',
                partId: 'text-1',
                partType: 'text',
            },
        ]).state

        state = reduceStreamChunk(state, {
            type: 'tool-start',
            input: 'value=1, from=kg, to=m',
            partId: 'tool-1',
            toolName: 'unit-convert',
        }).state

        const assistantMessage = getAssistantMessage(state)

        expect(assistantMessage?.parts.map(part => part.type)).toEqual(['text', 'tool'])
        expect(assistantMessage?.parts[0]).toMatchObject({
            text: '先输出正文。',
            type: 'text',
        })
        expect(assistantMessage?.parts[1]).toMatchObject({
            status: 'called',
            toolName: 'unit-convert',
            type: 'tool',
        })
    })

    it('error(scope=tool) 只更新对应 tool part 为 failed', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-1' },
            {
                type: 'tool-start',
                input: 'value=1, from=kg, to=m',
                partId: 'tool-1',
                toolName: 'unit-convert',
            },
            {
                type: 'error',
                errorCode: 'TOOL_EXECUTION_FAILED',
                input: 'value=1, from=kg, to=m',
                message: '单位类型不兼容',
                partId: 'tool-1',
                retryable: false,
                scope: 'tool',
                toolName: 'unit-convert',
            },
        ])

        const toolPart = getAssistantMessage(state)?.parts.find(part => part.type === 'tool')

        expect(toolPart).toMatchObject({
            error: '单位类型不兼容',
            status: 'failed',
            type: 'tool',
        })
    })

    it('runtime/request error 返回 fatalError 且保留 active stream', () => {
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-runtime-error' }])
        const result = reduceStreamChunk(state, {
            type: 'error',
            errorCode: 'MODEL_STREAM_FAILED',
            message: 'Model streaming failed.',
            retryable: true,
            scope: 'runtime',
            stage: 'runtime',
        })

        expect(result.fatalError).toBe('Model streaming failed.')
        expect(result.state.activeStream.messageId).toBe('assistant-runtime-error')
    })

    it('finish 会清理空 assistant 占位并重置 active stream', () => {
        const state = reduceChunks([{ type: 'start', messageId: 'assistant-empty' }, { type: 'finish' }])

        expect(state.messages).toHaveLength(0)
        expect(state.activeStream).toMatchObject({
            messageId: null,
            reasoningPartId: null,
            textPartId: null,
        })
    })

    it('artifact chunks 聚合到 message.artifacts', () => {
        const state = reduceChunks([
            { type: 'start', messageId: 'assistant-artifact' },
            {
                type: 'artifact-start',
                artifactId: 'artifact-1',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                title: 'Tasklist',
            },
            {
                type: 'artifact-delta',
                artifactId: 'artifact-1',
                delta: '# Step 1\n',
            },
            {
                type: 'artifact-end',
                artifactId: 'artifact-1',
                metadata: {
                    charCount: 9,
                },
                status: 'completed',
            },
        ])

        expect(getAssistantMessage(state)?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-1',
            content: '# Step 1\n',
            metadata: {
                charCount: 9,
            },
            status: 'completed',
            title: 'Tasklist',
        })
    })
})
