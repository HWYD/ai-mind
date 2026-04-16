import { createId } from '../internal/create-id'
import type { StreamErrorCode, StreamErrorStage } from '../protocol'
import { writeStreamErrorChunk } from './stream-error'
import type { StreamExecutionContext, WriteChunk } from './stream-types'

interface RuntimeErrorOptions {
    errorCode?: StreamErrorCode
    retryable?: boolean
    message: string
    stage?: StreamErrorStage
}

interface StreamLifecycleOptions {
    context: StreamExecutionContext
    isClosed: () => boolean
    writeChunk: WriteChunk
}

export class StreamLifecycle {
    private readonly context: StreamExecutionContext
    private readonly isClosed: () => boolean
    private readonly writeChunk: WriteChunk
    private started = false
    // 标记当前流是否已经完成最终收口；一旦发出 finish 或 runtime error，就不应再重复发送生命周期终态事件。
    private terminated = false

    constructor(options: StreamLifecycleOptions) {
        this.context = options.context
        this.isClosed = options.isClosed
        this.writeChunk = options.writeChunk
    }

    emitStartOnce() {
        if (this.started || this.terminated || this.isClosed()) {
            return false
        }

        this.started = true
        this.writeChunk({
            type: 'start',
            messageId: createId(),
        })

        return true
    }

    emitFinishIfOpen() {
        if (this.terminated || this.context.signal?.aborted || this.isClosed()) {
            return false
        }

        this.terminated = true
        this.writeChunk({
            type: 'finish',
        })

        return true
    }

    emitRuntimeErrorOnce(options: RuntimeErrorOptions) {
        if (this.terminated || this.context.signal?.aborted || this.isClosed()) {
            return false
        }

        this.terminated = true
        writeStreamErrorChunk(this.writeChunk, {
            scope: 'runtime',
            errorCode: options.errorCode ?? 'MODEL_STREAM_FAILED',
            retryable: options.retryable ?? true,
            message: options.message,
            stage: options.stage ?? 'runtime',
        })

        return true
    }
}
