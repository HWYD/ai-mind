import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs/ownership'

export const LEGACY_CHAT_MEMORY_THREAD_ID_REGEX = /^chat:[a-f0-9]{64}$/
export const CHAT_CONVERSATION_THREAD_ID_REGEX = /^chat-conversation:[a-f0-9]{64}:[a-f0-9]{64}$/
export const CHAT_CONVERSATION_REGISTRY_THREAD_ID_REGEX = /^chat-registry:[a-f0-9]{64}$/
export const CHAT_MEMORY_THREAD_ID_REGEX = /^(?:chat:[a-f0-9]{64}|chat-conversation:[a-f0-9]{64}:[a-f0-9]{64}|chat-registry:[a-f0-9]{64})$/

function assertNonEmptyConversationId(conversationId: string): string {
    const normalizedConversationId = conversationId.trim()

    if (!normalizedConversationId) {
        throw new Error('A non-empty conversationId is required for chat memory thread ownership.')
    }

    return normalizedConversationId
}

export function buildChatMemoryThreadId(sessionId: string, env: Record<string, string | undefined> = process.env): string {
    return `chat:${createAgentRunOwnerSessionHash(sessionId, env)}`
}

export function buildChatConversationThreadId(
    sessionId: string,
    conversationId: string,
    env: Record<string, string | undefined> = process.env
): string {
    const sessionHash = createAgentRunOwnerSessionHash(sessionId, env)
    const conversationHash = createAgentRunOwnerSessionHash(`${sessionId}:${assertNonEmptyConversationId(conversationId)}`, env)

    return `chat-conversation:${sessionHash}:${conversationHash}`
}

export function buildChatConversationRegistryThreadId(sessionId: string, env: Record<string, string | undefined> = process.env): string {
    return `chat-registry:${createAgentRunOwnerSessionHash(sessionId, env)}`
}

export function isChatConversationThreadId(threadId: string): boolean {
    return CHAT_CONVERSATION_THREAD_ID_REGEX.test(threadId)
}

export function isChatConversationRegistryThreadId(threadId: string): boolean {
    return CHAT_CONVERSATION_REGISTRY_THREAD_ID_REGEX.test(threadId)
}

export function isChatMemoryThreadId(threadId: string): boolean {
    return CHAT_MEMORY_THREAD_ID_REGEX.test(threadId)
}
