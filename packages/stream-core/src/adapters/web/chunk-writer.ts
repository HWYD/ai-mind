import type { WriteChunk } from '../../core/stream-types'
import type { ChatStreamChunk } from '../../protocol'

function toNdjsonLine(chunk: ChatStreamChunk): string {
    return `${JSON.stringify(chunk)}\n`
}

function isControllerClosedError(error: unknown): boolean {
    return error instanceof TypeError && error.message.includes('Controller is already closed')
}

export interface ChunkWriter {
    close: () => void
    isClosed: () => boolean
    writeChunk: WriteChunk
}

export function createNdjsonChunkWriter(controller: ReadableStreamDefaultController<Uint8Array>, encoder = new TextEncoder()): ChunkWriter {
    let closed = false

    const close = () => {
        if (closed) {
            return
        }

        closed = true

        try {
            controller.close()
        } catch (error) {
            if (!isControllerClosedError(error)) {
                throw error
            }
        }
    }

    const writeChunk: WriteChunk = chunk => {
        if (closed) {
            return
        }

        try {
            controller.enqueue(encoder.encode(toNdjsonLine(chunk)))
        } catch (error) {
            if (isControllerClosedError(error)) {
                closed = true
                return
            }

            throw error
        }
    }

    return {
        close,
        isClosed: () => closed,
        writeChunk,
    }
}
