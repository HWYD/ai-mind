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
    it('rejects raw legacy chunks', async () => {
        await expect(consumeNdjsonStream(createTextStream('{"type":"finish"}\n'), vi.fn())).rejects.toThrow('无法解析')
    })

    it('忽略用于长连接保活的空白行', async () => {
        const onChunk = vi.fn()

        await consumeNdjsonStream(
            createTextStream(
                '\n  \n{"protocolVersion":1,"eventId":"evt_done","runId":"run_1","sequence":1,"eventKind":"terminal","payload":{"type":"finish"},"terminal":true,"terminalState":"completed"}\n\n'
            ),
            onChunk
        )

        expect(onChunk).toHaveBeenCalledTimes(1)
        expect(onChunk).toHaveBeenCalledWith({ type: 'finish' })
    })

    it('非法 JSON 行会收口成统一的流式解析错误', async () => {
        await expect(consumeNdjsonStream(createTextStream('{bad json}\n'), vi.fn())).rejects.toThrow('无法解析')
    })

    it('schema 不匹配的 JSON 行会收口成统一的流式解析错误', async () => {
        await expect(consumeNdjsonStream(createTextStream('{"type":"unknown"}\n'), vi.fn())).rejects.toThrow('无法解析')
    })

    it('解包 resumable envelope payload，并在 chunk 应用后推进 cursor', async () => {
        const onChunk = vi.fn()
        const onEnvelope = vi.fn()
        const onCursor = vi.fn()

        await consumeNdjsonStream(
            createTextStream(
                '{"protocolVersion":1,"eventId":"evt_1","runId":"run_1","sequence":1,"eventKind":"chunk","payload":{"type":"text-delta","partId":"answer","delta":"hello"}}\n'
            ),
            onChunk,
            {
                onCursor,
                onEnvelope,
            }
        )

        expect(onEnvelope).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'evt_1', sequence: 1 }))
        expect(onChunk).toHaveBeenCalledWith({ type: 'text-delta', partId: 'answer', delta: 'hello' })
        expect(onCursor).toHaveBeenCalledWith({
            eventId: 'evt_1',
            lastAcknowledgedSequence: 1,
            protocolVersion: 1,
            runId: 'run_1',
        })
        expect(onChunk.mock.invocationCallOrder[0]).toBeLessThan(onCursor.mock.invocationCallOrder[0])
    })

    it('消费 run-status lifecycle envelope 时不伪造成 legacy chunk，但仍推进 cursor', async () => {
        const onChunk = vi.fn()
        const onCursor = vi.fn()

        await consumeNdjsonStream(
            createTextStream(
                '{"protocolVersion":1,"eventId":"evt_pause","runId":"run_1","sequence":2,"eventKind":"lifecycle","runStatus":"paused","payload":{"type":"run-status","status":"paused"}}\n'
            ),
            onChunk,
            {
                onCursor,
            }
        )

        expect(onChunk).not.toHaveBeenCalled()
        expect(onCursor).toHaveBeenCalledWith({
            eventId: 'evt_pause',
            lastAcknowledgedSequence: 2,
            protocolVersion: 1,
            runId: 'run_1',
        })
    })

    it('supports client-side duplicate sequence filtering before applying payload', async () => {
        const onChunk = vi.fn()
        const onCursor = vi.fn()

        await consumeNdjsonStream(
            createTextStream(
                [
                    '{"protocolVersion":1,"eventId":"evt_1","runId":"run_1","sequence":1,"eventKind":"chunk","payload":{"type":"text-delta","partId":"answer","delta":"hello"}}',
                    '{"protocolVersion":1,"eventId":"evt_1_dup","runId":"run_1","sequence":1,"eventKind":"chunk","payload":{"type":"text-delta","partId":"answer","delta":"duplicate"}}',
                ].join('\n') + '\n'
            ),
            onChunk,
            {
                onCursor,
                shouldApplyEnvelope: envelope => envelope.sequence > 1,
            }
        )

        expect(onChunk).not.toHaveBeenCalled()
        expect(onCursor).not.toHaveBeenCalled()
    })

    it('rejects an envelope from a different run before applying its payload', async () => {
        await expect(
            consumeNdjsonStream(
                createTextStream(
                    '{"protocolVersion":1,"eventId":"evt_1","runId":"run_other","sequence":1,"eventKind":"chunk","payload":{"type":"text-delta","partId":"answer","delta":"wrong"}}\n'
                ),
                vi.fn(),
                {
                    shouldApplyEnvelope: envelope => {
                        if (envelope.runId !== 'run_1') {
                            throw new Error('wrong run')
                        }

                        return true
                    },
                }
            )
        ).rejects.toThrow('wrong run')
    })

    it('lets the caller reject gap sequences before cursor advances', async () => {
        await expect(
            consumeNdjsonStream(
                createTextStream(
                    '{"protocolVersion":1,"eventId":"evt_3","runId":"run_1","sequence":3,"eventKind":"terminal","payload":{"type":"finish"},"terminal":true,"terminalState":"completed"}\n'
                ),
                vi.fn(),
                {
                    shouldApplyEnvelope: envelope => {
                        if (envelope.sequence > 1) {
                            throw new Error('gap')
                        }

                        return true
                    },
                }
            )
        ).rejects.toThrow('gap')
    })

    it('exposes terminal metadata to envelope consumers while applying the payload', async () => {
        const onChunk = vi.fn()
        const onEnvelope = vi.fn()
        const onCursor = vi.fn()

        await consumeNdjsonStream(
            createTextStream(
                '{"protocolVersion":1,"eventId":"evt_done","runId":"run_1","sequence":2,"eventKind":"terminal","payload":{"type":"finish"},"terminal":true,"terminalState":"completed"}\n'
            ),
            onChunk,
            {
                onCursor,
                onEnvelope,
            }
        )

        expect(onEnvelope).toHaveBeenCalledWith(expect.objectContaining({ terminal: true, terminalState: 'completed' }))
        expect(onChunk).toHaveBeenCalledWith({ type: 'finish' })
        expect(onCursor).toHaveBeenCalledWith(expect.objectContaining({ lastAcknowledgedSequence: 2 }))
    })
})
