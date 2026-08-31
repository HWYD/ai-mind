import type { LocalConversationIndex, LocalConversationSnapshot } from '@/components/instamind/local-chat-persistence/schema'

import { createMessageVirtualizationFixture } from './mixed-message-fixture'

export const DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE = '1000条测试数据'
export const DEV_MESSAGE_VIRTUALIZATION_REAL_SESSION_TITLE = '最长真实会话'

/**
 * 此 helper 只能由独立 dev route 调用，避免聊天页的 hydration persistence 覆盖刚写入的本地 snapshot。
 */
export function createDevMessageVirtualizationFixtureSnapshot(options: {
    conversationId: string
    createdAt: string
    revision: number
}): LocalConversationSnapshot {
    const snapshotAt = new Date().toISOString()

    return {
        conversationId: options.conversationId,
        createdAt: options.createdAt,
        lastActiveAt: snapshotAt,
        messages: createMessageVirtualizationFixture().map(message => ({
            ...message,
            parts: message.parts.map(part =>
                part.type === 'image-result' ? { ...part, contentPath: `/api/chat/runs/${part.runId}/image` } : part
            ),
            status: 'completed',
        })),
        revision: options.revision + 1,
        schemaVersion: 1,
        snapshotAt,
        title: DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE,
    }
}

/** 真实样本准备只重标记本机 index/snapshot，绝不复制正文或修改服务端会话。 */
export function prepareDevMessageVirtualizationRealSession(options: {
    index: LocalConversationIndex
    preparedAt: string
    snapshots: LocalConversationSnapshot[]
}) {
    if (options.index.isDraft) {
        return null
    }

    const conversationsById = new Map(options.index.conversations.map(conversation => [conversation.id, conversation]))
    const selectedSnapshot = options.snapshots
        .filter(snapshot => {
            const conversation = conversationsById.get(snapshot.conversationId)

            return (
                conversation !== undefined &&
                conversation.title !== DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE &&
                snapshot.title !== DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE &&
                snapshot.messages.length > 0
            )
        })
        .toSorted((left, right) => {
            const leftConversation = conversationsById.get(left.conversationId)
            const rightConversation = conversationsById.get(right.conversationId)
            const messageDifference = right.messages.length - left.messages.length

            if (messageDifference !== 0) {
                return messageDifference
            }

            const lastActiveDifference = (rightConversation?.lastActiveAt ?? '').localeCompare(leftConversation?.lastActiveAt ?? '')

            if (lastActiveDifference !== 0) {
                return lastActiveDifference
            }

            return left.conversationId.localeCompare(right.conversationId)
        })[0]

    if (!selectedSnapshot) {
        return null
    }

    const partTypeCounts: Record<string, number> = {}

    for (const message of selectedSnapshot.messages) {
        for (const part of message.parts) {
            partTypeCounts[part.type] = (partTypeCounts[part.type] ?? 0) + 1
        }
    }

    return {
        conversationId: selectedSnapshot.conversationId,
        messageCount: selectedSnapshot.messages.length,
        nextIndex: {
            ...options.index,
            conversations: options.index.conversations.map(conversation =>
                conversation.id === selectedSnapshot.conversationId
                    ? { ...conversation, title: DEV_MESSAGE_VIRTUALIZATION_REAL_SESSION_TITLE }
                    : conversation
            ),
            revision: options.index.revision + 1,
            selectedConversationId: selectedSnapshot.conversationId,
            updatedAt: options.preparedAt,
        },
        nextSnapshot: {
            ...selectedSnapshot,
            revision: selectedSnapshot.revision + 1,
            snapshotAt: options.preparedAt,
            title: DEV_MESSAGE_VIRTUALIZATION_REAL_SESSION_TITLE,
        },
        partTypeCounts,
    }
}
