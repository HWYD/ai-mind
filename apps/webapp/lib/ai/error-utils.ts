export function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
    }
}

export function isInvalidSkillError(error: unknown): boolean {
    return error instanceof Error && error.name === 'InvalidSkillError'
}
