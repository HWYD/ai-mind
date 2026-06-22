export type TasklistAgentModelStageName = 'planning-decision' | 'tasklist-draft' | 'tasklist-revision' | 'tasklist-strategy'

export class TasklistAgentStepTimeoutError extends Error {
    readonly code = 'MODEL_PROVIDER_TIMEOUT'

    readonly stage: TasklistAgentModelStageName

    readonly timeoutMs: number

    constructor(stage: TasklistAgentModelStageName, timeoutMs: number) {
        super(`Tasklist Agent stage "${stage}" timed out after ${timeoutMs}ms.`)
        this.name = 'TasklistAgentStepTimeoutError'
        this.stage = stage
        this.timeoutMs = timeoutMs
    }
}

function createAbortError(reason: unknown) {
    if (reason instanceof Error) {
        return reason
    }

    return new DOMException('The operation was aborted.', 'AbortError')
}

export async function runTasklistAgentModelStep<T>(options: {
    operation: (signal: AbortSignal) => Promise<T>
    signal?: AbortSignal
    stage: TasklistAgentModelStageName
    timeoutMs: number
}): Promise<T> {
    if (options.signal?.aborted) {
        throw createAbortError(options.signal.reason)
    }

    const stepAbortController = new AbortController()
    let rejectBoundary: ((reason?: unknown) => void) | undefined
    const boundaryPromise = new Promise<never>((_, reject) => {
        rejectBoundary = reject
    })
    const abortFromParent = () => {
        const error = createAbortError(options.signal?.reason)
        stepAbortController.abort(error)
        rejectBoundary?.(error)
    }
    const timeout = setTimeout(() => {
        const error = new TasklistAgentStepTimeoutError(options.stage, options.timeoutMs)
        stepAbortController.abort(error)
        rejectBoundary?.(error)
    }, options.timeoutMs)

    options.signal?.addEventListener('abort', abortFromParent, { once: true })

    try {
        return await Promise.race([options.operation(stepAbortController.signal), boundaryPromise])
    } finally {
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', abortFromParent)
    }
}
