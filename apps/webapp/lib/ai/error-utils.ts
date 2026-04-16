export function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

export function isInvalidSkillError(error: unknown): boolean {
    return error instanceof Error && error.name === 'InvalidSkillError'
}
