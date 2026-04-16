import { StreamLifecycle } from '../../src'
import type { ChatStreamChunk } from '../../src/protocol'

function createChunkRecorder() {
    const chunks: ChatStreamChunk[] = []

    return {
        chunks,
        writeChunk: (chunk: ChatStreamChunk) => {
            chunks.push(chunk)
        },
    }
}

describe('StreamLifecycle', () => {
    it('emits start chunk only once', () => {
        const recorder = createChunkRecorder()
        const lifecycle = new StreamLifecycle({
            context: {},
            isClosed: () => false,
            writeChunk: recorder.writeChunk,
        })

        expect(lifecycle.emitStartOnce()).toBe(true)
        expect(lifecycle.emitStartOnce()).toBe(false)
        expect(recorder.chunks).toHaveLength(1)
        expect(recorder.chunks[0]).toMatchObject({ type: 'start' })
    })

    it('emits finish chunk once when stream is open', () => {
        const recorder = createChunkRecorder()
        const lifecycle = new StreamLifecycle({
            context: {},
            isClosed: () => false,
            writeChunk: recorder.writeChunk,
        })

        lifecycle.emitStartOnce()

        expect(lifecycle.emitFinishIfOpen()).toBe(true)
        expect(lifecycle.emitFinishIfOpen()).toBe(false)
        expect(recorder.chunks.at(-1)).toEqual({ type: 'finish' })
    })

    it('emits runtime error chunk with defaults', () => {
        const recorder = createChunkRecorder()
        const lifecycle = new StreamLifecycle({
            context: {},
            isClosed: () => false,
            writeChunk: recorder.writeChunk,
        })

        expect(
            lifecycle.emitRuntimeErrorOnce({
                message: 'runtime failed',
            })
        ).toBe(true)

        expect(lifecycle.emitRuntimeErrorOnce({ message: 'should be ignored' })).toBe(false)
        expect(recorder.chunks).toHaveLength(1)
        expect(recorder.chunks[0]).toMatchObject({
            type: 'error',
            scope: 'runtime',
            errorCode: 'MODEL_STREAM_FAILED',
            retryable: true,
            stage: 'runtime',
            message: 'runtime failed',
        })
    })

    it('does not emit finish or runtime error when aborted', () => {
        const recorder = createChunkRecorder()
        const controller = new AbortController()
        controller.abort()

        const lifecycle = new StreamLifecycle({
            context: { signal: controller.signal },
            isClosed: () => false,
            writeChunk: recorder.writeChunk,
        })

        expect(lifecycle.emitFinishIfOpen()).toBe(false)
        expect(lifecycle.emitRuntimeErrorOnce({ message: 'ignored' })).toBe(false)
        expect(recorder.chunks).toHaveLength(0)
    })
})
