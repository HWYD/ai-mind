import type { MindMessage, MindMessagePart } from '@/lib/ai/types/message'

import {
    LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT,
    LOCAL_CHAT_SCHEMA_VERSION,
    type LocalConversationMetadata,
    type LocalConversationSnapshot,
} from './schema'

const RECOVERABLE_PART_TYPES = new Set(['agent-step', 'prompt', 'reasoning', 'resource', 'skill', 'text', 'tool', 'workflow-progress'])

function isRecoverablePart(part: MindMessagePart) {
    if (!RECOVERABLE_PART_TYPES.has(part.type)) {
        return false
    }

    if ('status' in part) {
        return part.status === undefined || part.status === 'completed' || part.status === 'failed'
    }

    return true
}

function isRecoverableArtifact(artifact: NonNullable<MindMessage['artifacts']>[number]) {
    return artifact.status === 'completed' || artifact.status === 'failed'
}

export function projectRecoverableMessages(messages: MindMessage[]): MindMessage[] {
    return messages
        .filter(message => (message.role === 'user' || message.role === 'assistant') && (!message.status || message.status === 'completed'))
        .map(message => {
            const parts = message.parts.filter(isRecoverablePart)
            const artifacts = message.artifacts?.filter(isRecoverableArtifact)

            return {
                ...message,
                parts,
                ...(artifacts && artifacts.length > 0 ? { artifacts } : { artifacts: undefined }),
                status: 'completed' as const,
            }
        })
        .filter(message => message.parts.length > 0 || (message.artifacts?.length ?? 0) > 0)
}

export function trimSnapshotMessages(messages: MindMessage[], limit = LOCAL_CHAT_MAX_MESSAGES_PER_SNAPSHOT) {
    if (messages.length <= limit) {
        return messages
    }

    return messages.slice(messages.length - limit)
}

export function createLocalConversationSnapshot(options: {
    conversation: LocalConversationMetadata
    messages: MindMessage[]
    previousRevision?: number
    snapshotAt?: string
}): LocalConversationSnapshot | null {
    const recoverableMessages = trimSnapshotMessages(projectRecoverableMessages(options.messages))

    if (recoverableMessages.length === 0) {
        return null
    }

    const snapshotAt = options.snapshotAt ?? new Date().toISOString()

    return {
        conversationId: options.conversation.id,
        createdAt: options.conversation.createdAt,
        lastActiveAt: options.conversation.lastActiveAt,
        messages: recoverableMessages,
        revision: (options.previousRevision ?? 0) + 1,
        schemaVersion: LOCAL_CHAT_SCHEMA_VERSION,
        snapshotAt,
        title: options.conversation.title,
    }
}
