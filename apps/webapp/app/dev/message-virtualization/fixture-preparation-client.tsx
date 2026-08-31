'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
    readLocalConversationIndex,
    readLocalConversationSnapshot,
    writeLocalConversationIndex,
    writeLocalConversationSnapshot,
} from '@/components/instamind/local-chat-persistence/store'
import {
    createDevMessageVirtualizationFixtureSnapshot,
    DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE,
    prepareDevMessageVirtualizationRealSession,
} from '@/lib/dev/message-virtualization/session-preparation'

const SELECTED_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-conversation-id'
const REAL_SESSION_TARGET_STORAGE_KEY = 'ai-mind:message-virtualization-real-session-target'

interface PreparedRealSession {
    messageCount: number
    partTypeCounts: Record<string, number>
}

export default function DevMessageVirtualizationPreparation() {
    const [error, setError] = useState<string | null>(null)
    const [realSession, setRealSession] = useState<PreparedRealSession | null>(null)
    const searchParams = useSearchParams()
    const target = searchParams.get('target')

    useEffect(() => {
        let cancelled = false

        void (async () => {
            const indexResult = await readLocalConversationIndex()

            if (target === 'real') {
                if (indexResult.status !== 'valid') {
                    if (!cancelled) {
                        setError('未找到有效的本地会话索引，无法准备真实回归样本。')
                    }
                    return
                }

                const snapshotResults = await Promise.all(
                    indexResult.data.conversations.map(conversation => readLocalConversationSnapshot(conversation.id))
                )
                const realSession = prepareDevMessageVirtualizationRealSession({
                    index: indexResult.data,
                    preparedAt: new Date().toISOString(),
                    snapshots: snapshotResults.flatMap(result => (result.status === 'valid' ? [result.data] : [])),
                })

                if (!realSession) {
                    if (!cancelled) {
                        setError('未找到可用真实会话：请先退出草稿并保留至少一条非“1000条测试数据”的本地会话。')
                    }
                    return
                }

                const snapshotWrite = await writeLocalConversationSnapshot(realSession.nextSnapshot)

                if (snapshotWrite.status !== 'written') {
                    if (!cancelled) {
                        setError(`真实会话快照标记失败：${snapshotWrite.status}`)
                    }
                    return
                }

                const indexWrite = await writeLocalConversationIndex(realSession.nextIndex)

                if (indexWrite.status !== 'written') {
                    if (!cancelled) {
                        setError(`真实会话索引标记失败：${indexWrite.status}`)
                    }
                    return
                }

                window.localStorage.setItem(
                    REAL_SESSION_TARGET_STORAGE_KEY,
                    JSON.stringify({
                        conversationId: realSession.conversationId,
                        messageCount: realSession.messageCount,
                        partTypeCounts: realSession.partTypeCounts,
                    })
                )
                window.localStorage.setItem(SELECTED_CONVERSATION_STORAGE_KEY, realSession.conversationId)
                if (!cancelled) {
                    setRealSession({
                        messageCount: realSession.messageCount,
                        partTypeCounts: realSession.partTypeCounts,
                    })
                }
                return
            }

            const selectedConversationId = window.localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY)?.trim()
            const selectedConversation =
                indexResult.status === 'valid' && selectedConversationId
                    ? indexResult.data.conversations.find(conversation => conversation.id === selectedConversationId)
                    : undefined

            if (!selectedConversationId || !selectedConversation || selectedConversation.title !== DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE) {
                if (!cancelled) {
                    setError(`请先在聊天页选中标题为“${DEV_MESSAGE_VIRTUALIZATION_TEST_TITLE}”的测试会话。`)
                }
                return
            }

            const snapshotResult = await readLocalConversationSnapshot(selectedConversationId)
            const createdAt = snapshotResult.status === 'valid' ? snapshotResult.data.createdAt : new Date().toISOString()
            const revision = snapshotResult.status === 'valid' ? snapshotResult.data.revision : 0
            const writeResult = await writeLocalConversationSnapshot(
                createDevMessageVirtualizationFixtureSnapshot({
                    conversationId: selectedConversationId,
                    createdAt,
                    revision,
                })
            )

            if (writeResult.status !== 'written') {
                if (!cancelled) {
                    setError(`IndexedDB 写入失败：${writeResult.status}`)
                }
                return
            }

            window.location.replace('/instant-mind')
        })()

        return () => {
            cancelled = true
        }
    }, [target])

    if (realSession) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
                <p role="status">已准备“最长真实会话”：{realSession.messageCount} 条消息。</p>
                <p className="text-sm text-muted-foreground">
                    Part 类型：
                    {Object.entries(realSession.partTypeCounts)
                        .toSorted(([left], [right]) => left.localeCompare(right))
                        .map(([type, count]) => `${type} ${count}`)
                        .join(' · ')}
                </p>
                <button
                    className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                    onClick={() => window.location.replace('/instant-mind')}
                    type="button"
                >
                    打开真实会话
                </button>
            </main>
        )
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-8">
            <p role="status">{error ?? (target === 'real' ? '正在准备最长真实会话…' : '正在写入 1,000 条本地测试消息…')}</p>
        </main>
    )
}
