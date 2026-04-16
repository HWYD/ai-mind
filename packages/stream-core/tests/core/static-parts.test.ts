import { writeStaticReasoningPart, writeStaticTextPart } from '../../src'
import type { ChatStreamChunk } from '../../src/protocol'

function collectChunks() {
    const chunks: ChatStreamChunk[] = []

    return {
        chunks,
        writeChunk: (chunk: ChatStreamChunk) => {
            chunks.push(chunk)
        },
    }
}

describe('static parts', () => {
    it('writes a complete static text part', () => {
        const collector = collectChunks()

        writeStaticTextPart(collector.writeChunk, 'hello')

        expect(collector.chunks).toHaveLength(3)
        expect(collector.chunks[0]).toMatchObject({ type: 'text-start' })
        const partId = (collector.chunks[0] as { partId: string }).partId
        expect(collector.chunks[1]).toEqual({
            type: 'text-delta',
            partId,
            delta: 'hello',
        })
        expect(collector.chunks[2]).toEqual({
            type: 'text-end',
            partId,
        })
    })

    it('writes a complete static reasoning part', () => {
        const collector = collectChunks()

        writeStaticReasoningPart(collector.writeChunk, 'because')

        expect(collector.chunks).toHaveLength(3)
        expect(collector.chunks[0]).toMatchObject({ type: 'reasoning-start' })
        const partId = (collector.chunks[0] as { partId: string }).partId
        expect(collector.chunks[1]).toEqual({
            type: 'reasoning-delta',
            partId,
            delta: 'because',
        })
        expect(collector.chunks[2]).toEqual({
            type: 'reasoning-end',
            partId,
        })
    })

    it('skips empty static parts', () => {
        const collector = collectChunks()

        writeStaticTextPart(collector.writeChunk, '')
        writeStaticReasoningPart(collector.writeChunk, '')

        expect(collector.chunks).toHaveLength(0)
    })
})
