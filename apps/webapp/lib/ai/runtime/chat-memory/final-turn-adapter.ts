import type { ChatThreadMessage } from './state-schema'

export const DELIVERY_FINAL_TEXT_LIMIT = 8_000
export const DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE = '\n\n[最终报告过长，已为聊天记忆截断保存。]'

export type FinalTurnSource = 'agent' | 'chat' | 'delivery-chain' | 'mcp-resource' | 'tasklist-agent' | 'tool'
export type FinalTurnCompletionStatus = 'blocked' | 'cancelled' | 'completed' | 'failed' | 'final' | 'interrupted' | 'paused'

export interface FinalTurnCandidateInput {
    assistantMessageId?: string
    assistantText: unknown
    completionStatus?: FinalTurnCompletionStatus
    source?: FinalTurnSource
    userMessageId?: string
    userText: unknown
}

export interface FinalTurnCandidate {
    assistantMessageId?: string
    assistantText: string
    completionStatus: Extract<FinalTurnCompletionStatus, 'blocked' | 'completed' | 'final'>
    source: FinalTurnSource
    userMessageId?: string
    userText: string
}

function isEligibleCompletionStatus(
    status: FinalTurnCompletionStatus | undefined
): status is Extract<FinalTurnCompletionStatus, 'blocked' | 'completed' | 'final'> {
    return status === 'blocked' || status === 'completed' || status === 'final'
}

function toTrimmedText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()

    return normalized.length > 0 ? normalized : null
}

function truncateDeliveryFinalText(text: string): string {
    if (text.length <= DELIVERY_FINAL_TEXT_LIMIT) {
        return text
    }

    const availableLength = Math.max(0, DELIVERY_FINAL_TEXT_LIMIT - DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE.length)
    const truncatedText = text.slice(0, availableLength).trimEnd()

    return `${truncatedText}${DELIVERY_FINAL_TEXT_TRUNCATION_NOTICE}`.slice(0, DELIVERY_FINAL_TEXT_LIMIT)
}

export function adaptFinalTurnCandidate(input: FinalTurnCandidateInput): FinalTurnCandidate | null {
    const completionStatus = input.completionStatus ?? 'completed'

    if (!isEligibleCompletionStatus(completionStatus)) {
        return null
    }

    const userText = toTrimmedText(input.userText)
    const assistantText = toTrimmedText(input.assistantText)

    if (!userText || !assistantText) {
        return null
    }

    const source = input.source ?? 'chat'

    return {
        assistantMessageId: input.assistantMessageId,
        assistantText: source === 'delivery-chain' ? truncateDeliveryFinalText(assistantText) : assistantText,
        completionStatus,
        source,
        userMessageId: input.userMessageId,
        userText,
    }
}

function hasMatchingMessageId(messages: ChatThreadMessage[], candidate: FinalTurnCandidate): boolean {
    if (!candidate.userMessageId && !candidate.assistantMessageId) {
        return false
    }

    return messages.some(message => message.id === candidate.userMessageId || message.id === candidate.assistantMessageId)
}

function hasMatchingTailPair(messages: ChatThreadMessage[], candidate: FinalTurnCandidate): boolean {
    if (candidate.userMessageId || candidate.assistantMessageId || messages.length < 2) {
        return false
    }

    const userMessage = messages.at(-2)
    const assistantMessage = messages.at(-1)

    return (
        userMessage?.role === 'user' &&
        assistantMessage?.role === 'assistant' &&
        userMessage.text === candidate.userText &&
        assistantMessage.text === candidate.assistantText
    )
}

export function hasDuplicateFinalTurn(messages: ChatThreadMessage[], candidate: FinalTurnCandidate): boolean {
    return hasMatchingMessageId(messages, candidate) || hasMatchingTailPair(messages, candidate)
}
