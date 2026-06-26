import { createHmac, timingSafeEqual } from 'node:crypto'

const MINIMUM_SESSION_SECRET_LENGTH = 32

export function createAgentRunOwnerSessionHash(sessionId: string, env: Record<string, string | undefined> = process.env): string {
    const normalizedSessionId = sessionId.trim()
    const secret = env.AI_MIND_AGENT_RUN_SESSION_SECRET?.trim()

    if (!normalizedSessionId) {
        throw new Error('A non-empty sessionId is required for AgentRun ownership.')
    }

    if (!secret || secret.length < MINIMUM_SESSION_SECRET_LENGTH) {
        throw new Error('AI_MIND_AGENT_RUN_SESSION_SECRET must contain at least 32 characters.')
    }

    return createHmac('sha256', secret).update(normalizedSessionId).digest('hex')
}

export function isAgentRunOwnerSessionHashEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex')
    const rightBuffer = Buffer.from(right, 'hex')

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}
