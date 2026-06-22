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
    writeHeartbeat: () => void
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

    const enqueue = (value: string) => {
        if (closed) {
            return
        }

        try {
            controller.enqueue(encoder.encode(value))
        } catch (error) {
            if (isControllerClosedError(error)) {
                closed = true
                return
            }

            throw error
        }
    }

    const writeChunk: WriteChunk = chunk => {
        enqueue(toNdjsonLine(chunk))
    }

    return {
        close,
        isClosed: () => closed,
        writeChunk,
        // NDJSON 消费端会忽略空行；代理仍能观察到数据活动，避免长模型步骤被判定为空闲连接。
        writeHeartbeat: () => enqueue('\n'),
    }
}
