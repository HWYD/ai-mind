import { describe, expect, it } from 'vitest'

import type { LocalConversationIndex, LocalConversationSnapshot } from '@/components/instamind/local-chat-persistence/schema'
import {
    createDevMessageVirtualizationFixtureSnapshot,
    prepareDevMessageVirtualizationRealSession,
} from '@/lib/dev/message-virtualization/session-preparation'

function createSnapshot(options: {
    conversationId: string
    lastActiveAt: string
    messageCount: number
    title: string
}): LocalConversationSnapshot {
    return {
        conversationId: options.conversationId,
        createdAt: '2026-08-30T00:00:00.000Z',
        lastActiveAt: options.lastActiveAt,
        messages: Array.from({ length: options.messageCount }, (_, index) => ({
            createdAt: `2026-08-30T00:00:${String(index).padStart(2, '0')}.000Z`,
            id: `${options.conversationId}-message-${index}`,
            parts: [{ format: 'markdown', id: `${options.conversationId}-part-${index}`, text: `message ${index}`, type: 'text' as const }],
            role: index % 2 === 0 ? 'user' : 'assistant',
            status: 'completed',
        })),
        revision: 4,
        schemaVersion: 1,
        snapshotAt: '2026-08-30T00:00:00.000Z',
        title: options.title,
    }
}

function createIndex(conversations: LocalConversationIndex['conversations']): LocalConversationIndex {
    return {
        conversations,
        isDraft: false,
        revision: 7,
        schemaVersion: 1,
        selectedConversationId: 'fixture',
        updatedAt: '2026-08-30T00:00:00.000Z',
    }
}

describe('development message-virtualization session preparation', () => {
    it('creates the deterministic completed 1,000-message snapshot through the dev module boundary', () => {
        const snapshot = createDevMessageVirtualizationFixtureSnapshot({
            conversationId: 'server-backed-test-conversation',
            createdAt: '2026-08-28T00:00:00.000Z',
            revision: 7,
        })

        expect(snapshot).toMatchObject({
            conversationId: 'server-backed-test-conversation',
            revision: 8,
            title: '1000条测试数据',
        })
        expect(snapshot.messages).toHaveLength(1000)
        expect(snapshot.messages.every(message => message.status === 'completed')).toBe(true)
        expect(new Set(snapshot.messages.map(message => message.id))).toHaveLength(1000)
        expect(
            snapshot.messages
                .flatMap(message => message.parts)
                .filter(
                    (part): part is Extract<(typeof snapshot.messages)[number]['parts'][number], { type: 'image-result' }> =>
                        part.type === 'image-result'
                )
                .every(part => part.contentPath === `/api/chat/runs/${part.runId}/image`)
        ).toBe(true)
    })

    it('only relabels the deterministic longest non-fixture local session', () => {
        const fixture = createSnapshot({
            conversationId: 'fixture',
            lastActiveAt: '2026-08-30T12:00:00.000Z',
            messageCount: 1000,
            title: '1000条测试数据',
        })
        const olderTie = createSnapshot({
            conversationId: 'real-z',
            lastActiveAt: '2026-08-30T09:00:00.000Z',
            messageCount: 3,
            title: 'Older real conversation',
        })
        const selectedTie = createSnapshot({
            conversationId: 'real-b',
            lastActiveAt: '2026-08-30T10:00:00.000Z',
            messageCount: 3,
            title: 'Newest real conversation',
        })
        const index = createIndex(
            [fixture, olderTie, selectedTie].map(snapshot => ({
                createdAt: snapshot.createdAt,
                hasMessages: true,
                id: snapshot.conversationId,
                lastActiveAt: snapshot.lastActiveAt,
                title: snapshot.title,
            }))
        )

        const result = prepareDevMessageVirtualizationRealSession({
            index,
            preparedAt: '2026-08-30T13:00:00.000Z',
            snapshots: [fixture, olderTie, selectedTie],
        })

        expect(result).toMatchObject({
            conversationId: 'real-b',
            messageCount: 3,
            partTypeCounts: { text: 3 },
        })
        expect(result?.nextIndex.selectedConversationId).toBe('real-b')
        expect(result?.nextSnapshot).toMatchObject({
            conversationId: 'real-b',
            revision: 5,
            snapshotAt: '2026-08-30T13:00:00.000Z',
            title: '最长真实会话',
        })
        expect(result?.nextSnapshot.messages).toEqual(selectedTie.messages)
        expect(selectedTie.title).toBe('Newest real conversation')
    })

    it('does not prepare a real-session target when every available snapshot is the fixture', () => {
        const fixture = createSnapshot({
            conversationId: 'fixture',
            lastActiveAt: '2026-08-30T12:00:00.000Z',
            messageCount: 1000,
            title: '1000条测试数据',
        })

        expect(
            prepareDevMessageVirtualizationRealSession({
                index: createIndex([
                    {
                        createdAt: fixture.createdAt,
                        hasMessages: true,
                        id: fixture.conversationId,
                        lastActiveAt: fixture.lastActiveAt,
                        title: fixture.title,
                    },
                ]),
                preparedAt: '2026-08-30T13:00:00.000Z',
                snapshots: [fixture],
            })
        ).toBeNull()
    })
})
