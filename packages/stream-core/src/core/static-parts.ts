import { createId } from '../internal/create-id'
import type { WriteChunk } from './stream-types'

export function writeStaticTextPart(writeChunk: WriteChunk, text: string) {
    if (!text) {
        return
    }

    const partId = createId()

    writeChunk({
        type: 'text-start',
        partId,
    })
    writeChunk({
        type: 'text-delta',
        partId,
        delta: text,
    })
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
    writeChunk({
        type: 'reasoning-delta',
        partId,
        delta: reasoning,
    })
    writeChunk({
        type: 'reasoning-end',
        partId,
    })
}
