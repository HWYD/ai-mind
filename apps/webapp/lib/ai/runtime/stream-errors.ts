export { createStreamErrorChunk, writeStreamErrorChunk, type StreamErrorPayload } from '@ai-mind/stream-core'

export function isControllerClosedError(error: unknown): boolean {
    return error instanceof TypeError && error.message.includes('Controller is already closed')
}

export function logChatCancellation(reason: string) {
    // eslint-disable-next-line no-console
    console.info(`[chat] stream cancelled: ${reason}`)
}

export function logSkillRuntime(event: string, payload: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') {
        return
    }

    // eslint-disable-next-line no-console
    console.info(`[skill-runtime] ${event}`, payload)
}

export function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
    }
}
