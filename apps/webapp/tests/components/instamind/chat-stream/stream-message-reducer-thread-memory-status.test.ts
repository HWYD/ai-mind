import { describe, expect, it } from 'vitest'

import {
    createStreamMessageState,
    reduceStreamChunk,
    reduceStreamTextDeltas,
} from '@/components/instamind/chat-stream/stream-message-reducer'

describe('stream-message-reducer thread-memory-status', () => {
    it('writes thread-memory-status chunks into the current assistant message and updates the same part', () => {
        let state = createStreamMessageState()

        state = reduceStreamChunk(state, { type: 'start', messageId: 'assistant-memory-status' }).state
        state = reduceStreamChunk(state, { type: 'text-start', partId: 'text-memory-status' }).state
        state = reduceStreamTextDeltas(state, [
            {
                messageId: 'assistant-memory-status',
                partId: 'text-memory-status',
                partType: 'text',
                delta: '正文回答',
            },
        ]).state
        state = reduceStreamChunk(state, {
            type: 'thread-memory-status',
            status: 'started',
            message: '上下自动压缩中',
        }).state
        state = reduceStreamChunk(state, {
            type: 'thread-memory-status',
            status: 'succeeded',
            message: '上下文已自动压缩',
            summaryLength: 32,
            pinnedDecisionCount: 1,
        }).state

        const assistantMessage = state.messages.find(message => message.id === 'assistant-memory-status')

        expect(assistantMessage?.parts).toEqual([
            expect.objectContaining({
                type: 'text',
                text: '正文回答',
            }),
            expect.objectContaining({
                type: 'thread-memory-status',
                status: 'succeeded',
                message: '上下文已自动压缩',
                summaryLength: 32,
                pinnedDecisionCount: 1,
            }),
        ])
    })
})
