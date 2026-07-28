import { vi } from 'vitest'

import { createNdjsonChunkWriter } from '../../../src/adapters/web'
import { type StreamEventEnvelope, streamProtocolVersion } from '../../../src/protocol'

const finishEnvelope: StreamEventEnvelope = {
    eventId: 'evt_1',
    eventKind: 'terminal',
    payload: {
        type: 'finish',
    },
    protocolVersion: streamProtocolVersion,
    runId: 'run_1',
    runStatus: 'completed',
    sequence: 1,
    terminal: true,
    terminalState: 'completed',
}

describe('createNdjsonChunkWriter', () => {
    it('writes an envelope as an ndjson line', () => {
        const decoder = new TextDecoder()
        const writtenLines: string[] = []

        const controller = {
            close: vi.fn(),
            enqueue: vi.fn((chunk: Uint8Array) => {
                writtenLines.push(decoder.decode(chunk))
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.writeEnvelope(finishEnvelope)

        expect(writtenLines).toEqual([
            '{"eventId":"evt_1","eventKind":"terminal","payload":{"type":"finish"},"protocolVersion":1,"runId":"run_1","runStatus":"completed","sequence":1,"terminal":true,"terminalState":"completed"}\n',
        ])
    })

    it('writes heartbeat as an empty ndjson line', () => {
        const decoder = new TextDecoder()
        const writtenLines: string[] = []
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn((chunk: Uint8Array) => {
                writtenLines.push(decoder.decode(chunk))
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.writeHeartbeat()

        expect(writtenLines).toEqual(['\n'])
    })

    it('writes envelope lines without changing heartbeat semantics', () => {
        const decoder = new TextDecoder()
        const writtenLines: string[] = []
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn((chunk: Uint8Array) => {
                writtenLines.push(decoder.decode(chunk))
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.writeEnvelope({
            eventId: 'evt_1',
            eventKind: 'chunk',
            payload: { delta: 'hello', partId: 'answer', type: 'text-delta' },
            protocolVersion: streamProtocolVersion,
            runId: 'run_1',
            runStatus: 'running',
            sequence: 1,
        })
        writer.writeHeartbeat()

        expect(writtenLines).toEqual([
            '{"eventId":"evt_1","eventKind":"chunk","payload":{"delta":"hello","partId":"answer","type":"text-delta"},"protocolVersion":1,"runId":"run_1","runStatus":"running","sequence":1}\n',
            '\n',
        ])
    })

    it('writes a pre-built envelope line directly', () => {
        const decoder = new TextDecoder()
        const writtenLines: string[] = []
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn((chunk: Uint8Array) => {
                writtenLines.push(decoder.decode(chunk))
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.writeEnvelope(finishEnvelope)

        expect(writtenLines).toEqual([
            '{"eventId":"evt_1","eventKind":"terminal","payload":{"type":"finish"},"protocolVersion":1,"runId":"run_1","runStatus":"completed","sequence":1,"terminal":true,"terminalState":"completed"}\n',
        ])
    })

    it('closes only once and blocks writes after close', () => {
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn(),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.close()
        writer.close()
        writer.writeEnvelope(finishEnvelope)

        expect(writer.isClosed()).toBe(true)
        expect(controller.close).toHaveBeenCalledTimes(1)
        expect(controller.enqueue).toHaveBeenCalledTimes(0)
    })

    it('marks closed when enqueue gets controller closed error', () => {
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn(() => {
                throw new TypeError('Controller is already closed')
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)

        expect(() => writer.writeEnvelope(finishEnvelope)).not.toThrow()
        expect(writer.isClosed()).toBe(true)
    })

    it('rethrows unknown enqueue errors', () => {
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn(() => {
                throw new Error('unknown failure')
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)

        expect(() => writer.writeEnvelope(finishEnvelope)).toThrow('unknown failure')
    })
})
