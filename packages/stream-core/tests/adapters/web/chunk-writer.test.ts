import { vi } from 'vitest'

import { createNdjsonChunkWriter } from '../../../src/adapters/web'

describe('createNdjsonChunkWriter', () => {
    it('writes chunk as ndjson line', () => {
        const decoder = new TextDecoder()
        const writtenLines: string[] = []

        const controller = {
            close: vi.fn(),
            enqueue: vi.fn((chunk: Uint8Array) => {
                writtenLines.push(decoder.decode(chunk))
            }),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.writeChunk({
            type: 'finish',
        })

        expect(writtenLines).toEqual(['{"type":"finish"}\n'])
    })

    it('closes only once and blocks writes after close', () => {
        const controller = {
            close: vi.fn(),
            enqueue: vi.fn(),
        } as unknown as ReadableStreamDefaultController<Uint8Array>

        const writer = createNdjsonChunkWriter(controller)
        writer.close()
        writer.close()
        writer.writeChunk({
            type: 'finish',
        })

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

        expect(() =>
            writer.writeChunk({
                type: 'finish',
            })
        ).not.toThrow()
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

        expect(() =>
            writer.writeChunk({
                type: 'finish',
            })
        ).toThrow('unknown failure')
    })
})
