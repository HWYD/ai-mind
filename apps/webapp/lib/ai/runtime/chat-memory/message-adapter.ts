import { createId } from '@/lib/ai/create-id'
import type { MindMessage, TextPart } from '@/lib/ai/types/message'

import type { ChatThreadMessage } from './state-schema'

function getText(message: Pick<MindMessage, 'parts'>): string {
    return message.parts
        .filter((part): part is TextPart => part.type === 'text' && part.text.trim().length > 0)
        .map(part => part.text)
        .join('\n\n')
        .trim()
}

function isTextOnlyVisibleMessage(message: MindMessage): message is MindMessage & { role: 'user' | 'assistant' } {
    return (
        (message.role === 'user' || message.role === 'assistant') &&
        (message.status === undefined || message.status === 'completed') &&
        !message.artifacts?.length &&
        message.parts.length > 0 &&
        message.parts.every(part => part.type === 'text') &&
        getText(message).length > 0
    )
}

export function toChatThreadMessage(message: MindMessage): ChatThreadMessage | null {
    if (!isTextOnlyVisibleMessage(message)) {
        return null
    }

    return {
        id: message.id,
        role: message.role,
        text: getText(message),
        createdAt: message.createdAt,
    }
}

export function createChatThreadMessage(role: 'assistant' | 'user', text: string, id = createId()): ChatThreadMessage | null {
    const normalizedText = text.trim()

    if (!normalizedText) {
        return null
    }

    return {
        id,
        role,
        text: normalizedText,
        createdAt: new Date().toISOString(),
    }
}

export function toMindMessage(message: ChatThreadMessage): MindMessage {
    return {
        id: message.id,
        role: message.role,
        parts: [
            {
                type: 'text',
                text: message.text,
                format: 'markdown',
            },
        ],
        createdAt: message.createdAt,
        status: 'completed',
    }
}

export function toMindMessages(messages: ChatThreadMessage[]): MindMessage[] {
    return messages.map(toMindMessage)
}
