import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs/ownership'

export function buildChatMemoryThreadId(sessionId: string, env: Record<string, string | undefined> = process.env): string {
    return `chat:${createAgentRunOwnerSessionHash(sessionId, env)}`
}

export function isChatMemoryThreadId(threadId: string): boolean {
    return /^chat:[a-f0-9]{64}$/.test(threadId)
}
