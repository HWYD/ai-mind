'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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
        payload.limit === 10
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
    const [error, setError] = useState<string | null>(null)
    const isMountedRef = useRef(true)

    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
        }
    }, [])

    const applyRegistryPayload = useCallback((payload: ConversationRegistryPayload, options: { preferDraft?: boolean } = {}) => {
        if (!isMountedRef.current) {
            return
        }

        const shouldEnterDraft = options.preferDraft || (!payload.selectedConversationId && payload.conversations.length === 0)

        setConversations(payload.conversations)
        setSelectedConversationId(shouldEnterDraft ? null : payload.selectedConversationId)
        setIsDraft(shouldEnterDraft)
        setError(null)

        if (shouldEnterDraft) {
            writeStoredConversationId(null)
            writeStoredDraftSelection()
            return
        }

        clearStoredDraftSelection()
        writeStoredConversationId(payload.selectedConversationId)
    }, [])

    const fetchRegistry = useCallback(
        async (options: { conversationIdHint?: string; preferDraft?: boolean } = {}) => {
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

            try {
                await fetchRegistry({
                    conversationIdHint: conversationRestoreHint ?? undefined,
                    preferDraft: draftRestoreHint,
                })
            } catch {
                if (!cancelled && isMountedRef.current) {
                    setConversations([])
                    setSelectedConversationId(null)
                    setIsDraft(draftRestoreHint)
                    setError('Conversation registry is unavailable.')
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
    }, [fetchRegistry])

    async function mutateConversationRegistry(body: Record<string, unknown>) {
        const response = await fetch('/api/chat/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        const data = (await response.json().catch(() => null)) as unknown

        if (!response.ok || !isConversationRegistryPayload(data)) {
            throw new Error('Conversation registry request failed.')
        }

        applyRegistryPayload(data)
        return true
    }

    async function createConversation() {
        if (interactionLocked || isLoading || isMutating) {
            return false
        }

        setIsDraft(true)
        setSelectedConversationId(null)
        setError(null)
        writeStoredConversationId(null)
        writeStoredDraftSelection()
        return true
    }

    async function selectConversation(conversationId: string) {
        if (interactionLocked || isLoading || isMutating) {
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
            writeStoredConversationId(conversationId)
        }
    }

    const visibleConversations = conversations.map(conversation => ({
        ...conversation,
        selected: !isDraft && conversation.id === selectedConversationId,
    }))

    return {
        conversations: visibleConversations,
        createConversation,
        error,
        handleConversationPromoted,
        interactionDisabled: interactionLocked || isLoading || isMutating,
        isDraft,
        isLoading,
        isMutating,
        selectedConversation: !isDraft
            ? (visibleConversations.find(conversation => conversation.id === selectedConversationId) ?? null)
            : null,
        selectedConversationId,
        selectConversation,
    }
}

export { DRAFT_CONVERSATION_STORAGE_KEY, SELECTED_CONVERSATION_STORAGE_KEY }
