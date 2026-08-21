'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
    createEmptyLocalConversationIndex,
    type LocalConversationIndex,
    type LocalConversationMetadata,
} from '../local-chat-persistence/schema'
import {
    createIndexFromRegistry,
    deleteLocalConversationSnapshots,
    deleteLocalImageResultCaches,
    readLocalConversationIndex,
    reconcileLocalConversationIndex,
    writeLocalConversationIndex,
} from '../local-chat-persistence/store'
import type { ConversationListItem, ConversationRegistryPayload } from './types'

const SELECTED_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-conversation-id'
const DRAFT_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-draft'

function isConversationRegistryPayload(value: unknown): value is ConversationRegistryPayload {
    if (!value || typeof value !== 'object') {
        return false
    }

    const payload = value as Partial<ConversationRegistryPayload>

    return (
        (typeof payload.selectedConversationId === 'string' || payload.selectedConversationId === null) &&
        Array.isArray(payload.conversations) &&
        payload.limit === 50
    )
}

function readStoredConversationId(): string | null {
    if (typeof window === 'undefined') {
        return null
    }

    const storedConversationId = window.localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY)?.trim()

    return storedConversationId || null
}

function writeStoredConversationId(conversationId: string | null) {
    if (typeof window === 'undefined') {
        return
    }

    if (!conversationId) {
        window.localStorage.removeItem(SELECTED_CONVERSATION_STORAGE_KEY)
        return
    }

    window.localStorage.setItem(SELECTED_CONVERSATION_STORAGE_KEY, conversationId)
}

function readStoredDraftSelection() {
    if (typeof window === 'undefined') {
        return false
    }

    return window.localStorage.getItem(DRAFT_CONVERSATION_STORAGE_KEY) === '1'
}

function writeStoredDraftSelection() {
    if (typeof window === 'undefined') {
        return
    }

    window.localStorage.setItem(DRAFT_CONVERSATION_STORAGE_KEY, '1')
}

function clearStoredDraftSelection() {
    if (typeof window === 'undefined') {
        return
    }

    window.localStorage.removeItem(DRAFT_CONVERSATION_STORAGE_KEY)
}

function toConversationListItems(conversations: LocalConversationMetadata[], selectedConversationId: string | null) {
    return conversations.map(conversation => ({
        ...conversation,
        selected: conversation.id === selectedConversationId,
    }))
}

interface UseConversationSessionsOptions {
    interactionLocked?: boolean
}

export function useConversationSessions(options: UseConversationSessionsOptions = {}) {
    const interactionLocked = options.interactionLocked ?? false
    const [conversations, setConversations] = useState<ConversationListItem[]>([])
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
    const [isDraft, setIsDraft] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isMutating, setIsMutating] = useState(false)
    const [isReadOnlyCache, setIsReadOnlyCache] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [registryRetryToken, setRegistryRetryToken] = useState(0)
    const isMountedRef = useRef(true)
    const localIndexRevisionRef = useRef(0)

    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
        }
    }, [])

    const persistRegistryPayload = useCallback(
        async (
            payload: ConversationRegistryPayload,
            shouldEnterDraft: boolean,
            baseline?: LocalConversationIndex,
            cleanupConversationIds: string[] = []
        ) => {
            const localIndexResult = baseline ? { data: baseline, status: 'valid' as const } : await readLocalConversationIndex()
            const localIndex = localIndexResult.status === 'valid' ? localIndexResult.data : createEmptyLocalConversationIndex()

            localIndexRevisionRef.current = Math.max(localIndexRevisionRef.current, localIndex.revision)
            const retainedConversationIds = new Set(payload.conversations.map(conversation => conversation.id))
            const staleConversationIds = localIndex.conversations
                .map(conversation => conversation.id)
                .filter(conversationId => !retainedConversationIds.has(conversationId))
            const conversationIdsToDelete = [...new Set([...staleConversationIds, ...cleanupConversationIds])]
            const writeResult = await reconcileLocalConversationIndex(
                createIndexFromRegistry({
                    conversations: payload.conversations,
                    isDraft: shouldEnterDraft,
                    previousRevision: localIndexRevisionRef.current,
                    selectedConversationId: shouldEnterDraft ? null : payload.selectedConversationId,
                }),
                localIndex
            )

            if (writeResult.status === 'written') {
                localIndexRevisionRef.current = writeResult.revision
                await Promise.all([
                    deleteLocalConversationSnapshots(conversationIdsToDelete),
                    deleteLocalImageResultCaches(conversationIdsToDelete),
                ])
            }
        },
        []
    )

    const applyRegistryPayload = useCallback(
        (
            payload: ConversationRegistryPayload,
            options: {
                cleanupConversationIds?: string[]
                localIndexBaseline?: LocalConversationIndex
                preferDraft?: boolean
            } = {}
        ) => {
            if (!isMountedRef.current) {
                return
            }

            const shouldEnterDraft = options.preferDraft || (!payload.selectedConversationId && payload.conversations.length === 0)

            setConversations(payload.conversations)
            setSelectedConversationId(shouldEnterDraft ? null : payload.selectedConversationId)
            setIsDraft(shouldEnterDraft)
            setIsReadOnlyCache(false)
            setError(null)
            void persistRegistryPayload(payload, shouldEnterDraft, options.localIndexBaseline, options.cleanupConversationIds)

            if (shouldEnterDraft) {
                writeStoredConversationId(null)
                writeStoredDraftSelection()
                return
            }

            clearStoredDraftSelection()
            writeStoredConversationId(payload.selectedConversationId)
        },
        [persistRegistryPayload]
    )

    const applyLocalIndex = useCallback((index: LocalConversationIndex) => {
        if (!isMountedRef.current) {
            return
        }

        localIndexRevisionRef.current = index.revision
        setConversations(toConversationListItems(index.conversations, index.selectedConversationId))
        setSelectedConversationId(index.isDraft ? null : index.selectedConversationId)
        setIsDraft(index.isDraft)
        setError(null)
    }, [])

    const fetchRegistry = useCallback(
        async (options: { conversationIdHint?: string; localIndexBaseline?: LocalConversationIndex; preferDraft?: boolean } = {}) => {
            let localIndexBaseline = options.localIndexBaseline

            if (!localIndexBaseline) {
                const localIndexResult = await readLocalConversationIndex()
                localIndexBaseline = localIndexResult.status === 'valid' ? localIndexResult.data : undefined
            }
            const response = await fetch(
                options.conversationIdHint
                    ? `/api/chat/conversations?conversationId=${encodeURIComponent(options.conversationIdHint)}`
                    : '/api/chat/conversations'
            )
            const data = (await response.json().catch(() => null)) as unknown

            if (!response.ok || !isConversationRegistryPayload(data)) {
                throw new Error('Conversation registry request failed.')
            }

            applyRegistryPayload(data, {
                localIndexBaseline,
                preferDraft: options.preferDraft,
            })
            return true
        },
        [applyRegistryPayload]
    )

    useEffect(() => {
        let cancelled = false

        async function hydrateRegistry() {
            setIsLoading(true)

            const draftRestoreHint = readStoredDraftSelection()
            const conversationRestoreHint = draftRestoreHint ? null : readStoredConversationId()
            const localIndex = await readLocalConversationIndex()
            const hasValidLocalIndex = localIndex.status === 'valid'

            if (!cancelled && hasValidLocalIndex) {
                applyLocalIndex(localIndex.data)
            }

            try {
                await fetchRegistry({
                    conversationIdHint: conversationRestoreHint ?? undefined,
                    localIndexBaseline: hasValidLocalIndex ? localIndex.data : undefined,
                    preferDraft: draftRestoreHint,
                })
            } catch {
                if (!cancelled && isMountedRef.current) {
                    if (hasValidLocalIndex) {
                        setIsReadOnlyCache(true)
                        setError('当前显示的是浏览器本地只读缓存，服务端会话暂未确认。')
                    } else {
                        setConversations([])
                        setSelectedConversationId(null)
                        setIsDraft(draftRestoreHint)
                        setIsReadOnlyCache(false)
                        setError('Conversation registry is unavailable.')
                    }
                }
            } finally {
                if (!cancelled && isMountedRef.current) {
                    setIsLoading(false)
                }
            }
        }

        void hydrateRegistry()

        return () => {
            cancelled = true
        }
    }, [applyLocalIndex, fetchRegistry, registryRetryToken])

    async function mutateConversationRegistry(
        body: Record<string, unknown>,
        method: 'DELETE' | 'POST' = 'POST',
        options: { cleanupConversationIds?: string[] } = {}
    ) {
        const response = await fetch('/api/chat/conversations', {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        const data = (await response.json().catch(() => null)) as unknown

        if (!response.ok || !isConversationRegistryPayload(data)) {
            throw new Error('Conversation registry request failed.')
        }

        applyRegistryPayload(data, options)
        return true
    }

    async function deleteConversation(conversationId: string) {
        if (interactionLocked || isLoading || isMutating || isReadOnlyCache) {
            return false
        }

        setIsMutating(true)

        try {
            return await mutateConversationRegistry({ conversationId }, 'DELETE', { cleanupConversationIds: [conversationId] })
        } catch {
            if (isMountedRef.current) {
                setError('会话删除失败，服务端数据未确认清理，请稍后重试。')
            }
            return false
        } finally {
            if (isMountedRef.current) {
                setIsMutating(false)
            }
        }
    }

    async function createConversation() {
        if (interactionLocked || isLoading || isMutating || isReadOnlyCache) {
            return false
        }

        setIsDraft(true)
        setSelectedConversationId(null)
        setIsReadOnlyCache(false)
        setError(null)
        writeStoredConversationId(null)
        writeStoredDraftSelection()
        void writeLocalConversationIndex(
            createIndexFromRegistry({
                conversations,
                isDraft: true,
                previousRevision: localIndexRevisionRef.current,
                selectedConversationId: null,
            })
        ).then(result => {
            if (result.status === 'written') {
                localIndexRevisionRef.current = result.revision
            }
        })
        return true
    }

    async function selectConversation(conversationId: string) {
        if (interactionLocked || isLoading || isMutating || isReadOnlyCache) {
            return false
        }

        if (!isDraft && conversationId === selectedConversationId) {
            return true
        }

        setIsMutating(true)

        try {
            clearStoredDraftSelection()
            return await mutateConversationRegistry({
                conversationId,
            })
        } catch {
            if (isMountedRef.current) {
                setError('Conversation registry is unavailable.')
            }
            return false
        } finally {
            if (isMountedRef.current) {
                setIsMutating(false)
            }
        }
    }

    async function handleConversationPromoted(conversationId: string) {
        clearStoredDraftSelection()

        try {
            await fetchRegistry({
                conversationIdHint: conversationId,
            })
        } catch {
            if (!isMountedRef.current) {
                return
            }

            setIsDraft(false)
            setSelectedConversationId(conversationId)
            setIsReadOnlyCache(false)
            writeStoredConversationId(conversationId)
        }
    }

    function retryRecovery() {
        if (isMutating) {
            return false
        }

        setRegistryRetryToken(current => current + 1)
        return true
    }

    const visibleConversations = conversations.map(conversation => ({
        ...conversation,
        selected: !isDraft && conversation.id === selectedConversationId,
    }))

    return {
        conversations: visibleConversations,
        createConversation,
        deleteConversation,
        error,
        handleConversationPromoted,
        interactionDisabled: interactionLocked || isLoading || isMutating || isReadOnlyCache,
        isDraft,
        isLoading,
        isMutating,
        isReadOnlyCache,
        readOnlyCacheMessage: isReadOnlyCache ? '当前显示的是浏览器本地只读缓存，服务端恢复后才能继续发送或切换会话。' : null,
        retryRecovery,
        selectedConversation: !isDraft
            ? (visibleConversations.find(conversation => conversation.id === selectedConversationId) ?? null)
            : null,
        selectedConversationId,
        selectConversation,
    }
}

export { DRAFT_CONVERSATION_STORAGE_KEY, SELECTED_CONVERSATION_STORAGE_KEY }
