import { createId } from '../internal/create-id'
import type { WriteChunk } from './stream-types'

const maxStaticPartDeltaBytes = 128 * 1024

function splitStaticPartText(text: string): string[] {
    const encoder = new TextEncoder()
    const chunks: string[] = []
    let currentChunk = ''
    let currentChunkBytes = 0

    for (const character of text) {
        const characterBytes = encoder.encode(character).length

        if (currentChunk && currentChunkBytes + characterBytes > maxStaticPartDeltaBytes) {
            chunks.push(currentChunk)
            currentChunk = ''
            currentChunkBytes = 0
        }

        currentChunk += character
        currentChunkBytes += characterBytes
    }

    if (currentChunk) {
        chunks.push(currentChunk)
    }

    return chunks
}

export function writeStaticTextPart(writeChunk: WriteChunk, text: string) {
    if (!text) {
        return
    }

    const partId = createId()

    writeChunk({
        type: 'text-start',
        partId,
    })
    for (const delta of splitStaticPartText(text)) {
        writeChunk({
            type: 'text-delta',
            partId,
            delta,
        })
    }
    writeChunk({
        type: 'text-end',
        partId,
    })
}

export function writeStaticReasoningPart(writeChunk: WriteChunk, reasoning: string) {
    if (!reasoning) {
        return
    }

    const partId = createId()

    writeChunk({
        type: 'reasoning-start',
        partId,
    })
    for (const delta of splitStaticPartText(reasoning)) {
        writeChunk({
            type: 'reasoning-delta',
            partId,
            delta,
        })
    }
    writeChunk({
        type: 'reasoning-end',
        partId,
    })
}
