import type { AgentRunApiErrorCode } from './contracts'

export class AgentRunServiceError extends Error {
    readonly code: AgentRunApiErrorCode

    constructor(code: AgentRunApiErrorCode, message: string) {
        super(message)
        this.name = 'AgentRunServiceError'
        this.code = code
    }
}
