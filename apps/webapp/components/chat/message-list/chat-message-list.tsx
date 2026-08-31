'use client'

import { memo, type Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { type Components, type ItemProps, type ListItem, type ListRange, Virtuoso, type VirtuosoHandle } from 'react-virtuoso'

import {
    LOCAL_MESSAGE_HEIGHT_HINT_MAX_ENTRIES,
    type LocalMessageHeightHintEntry,
} from '@/components/instamind/local-chat-persistence/schema'
import { readLocalMessageHeightHints, writeLocalMessageHeightHints } from '@/components/instamind/local-chat-persistence/store'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage, ReasoningPart } from '@/lib/ai/types/message'
import { copyTextToClipboard } from '@/lib/browser/copy-text-to-clipboard'

import { MessageDisclosureProvider } from './message-disclosure-provider'
import { createMessageDisclosureKey, getDisclosurePartIdentity } from './message-disclosure-state'
import {
    createMessageHeightHintLayoutKey,
    createMessageRenderFingerprint,
    mergeMessageHeightHints,
    MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION,
    type MessageHeightHintCandidate,
    observeMessageHeightHintCandidate,
} from './message-height-hints'
import { AssistantMessage } from './messages/assistant-message'
import { UserMessage } from './messages/user-message'
import {
    type AssistantFeedback,
    buildCombinedReasoning,
    type ChatListStatus,
    getMessageCopyText,
    getMessageTextContent,
    hasVisibleContent,
} from './shared/message-list-utils'
import { ThinkingText } from './shared/thinking-text'
import type { EmptyStateSuggestion } from './suggestions/empty-state-suggestion-options'
import { EmptyStateSuggestions } from './suggestions/empty-state-suggestions'

interface MessageEntry {
    message: MindMessage
    renderFingerprint: string
    requestComposer?: ChatComposerPayload
}

const DEFAULT_MESSAGE_COLUMN_WIDTH = 856
const HEIGHT_HINT_READ_TIMEOUT_MS = 500
const MAX_ESTIMATED_MESSAGE_HEIGHT = 8_000
const MAX_ESTIMATED_TEXT_LINE_COUNT = 240
const MESSAGE_ITEM_VERTICAL_PADDING = 20
const TEXT_LINE_HEIGHT = 28
const WIDE_TEXT_CHARACTER_PATTERN = /[\u1100-\u115f\u2e80-\ua4cf\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/

interface MessageListContext {
    bottomInset: number
    onItemMounted?: (itemIndex: number) => void
    onItemUnmounted?: (itemIndex: number) => void
}

interface MessageHeightEstimateContext {
    enableReasoning: boolean
    requestComposer?: ChatComposerPayload
}

interface MessageHeightHintReadState {
    entries: LocalMessageHeightHintEntry[]
    requestKey: string | null
    status: 'idle' | 'loading' | 'ready'
}

interface MessageHeightHintRuntime {
    conversationId?: string
    entriesByMessageId: ReadonlyMap<string, MessageEntry>
    isBusy: boolean
    layoutKey: string
    latestAssistantMessageId?: string
    messageColumnWidth: number
    ready: boolean
    requestKey: string | null
}

export interface ChatMessageListHandle {
    scrollToEnd(behavior: 'auto' | 'smooth'): void
}

function MessageListItem({
    children,
    context,
    'data-item-index': itemIndex,
    item: _item,
    style,
    ...props
}: ItemProps<MessageEntry> & { context?: MessageListContext }) {
    const onItemMounted = context?.onItemMounted
    const onItemUnmounted = context?.onItemUnmounted

    useLayoutEffect(() => {
        onItemMounted?.(itemIndex)

        return () => onItemUnmounted?.(itemIndex)
    }, [itemIndex, onItemMounted, onItemUnmounted])

    return (
        <div {...props} data-item-index={itemIndex} style={{ ...style, paddingBlock: '0.625rem' }}>
            {children}
        </div>
    )
}

function MessageListFooter({ context }: { context?: MessageListContext }) {
    return <div aria-hidden="true" style={{ height: `${context?.bottomInset ?? 0}px` }} />
}

const messageListComponents: Components<MessageEntry, MessageListContext> = {
    Footer: MessageListFooter,
    Item: MessageListItem,
}

function computeMessageItemKey(_index: number, entry: MessageEntry) {
    return entry.message.id
}

function resolveMessageColumnWidth(viewportWidth: number): number {
    const horizontalPadding = viewportWidth >= 1024 ? 64 : viewportWidth >= 640 ? 48 : 32

    return Math.max(240, Math.min(DEFAULT_MESSAGE_COLUMN_WIDTH, Math.round(viewportWidth - horizontalPadding)))
}

function resolveMeasuredMessageColumnWidth(scrollParent: HTMLElement) {
    const messageColumnWidth = scrollParent.querySelector<HTMLElement>('[data-slot="chat-main-column"]')?.getBoundingClientRect().width

    if (messageColumnWidth && messageColumnWidth > 0) {
        return Math.max(240, Math.min(DEFAULT_MESSAGE_COLUMN_WIDTH, Math.round(messageColumnWidth)))
    }

    const viewportWidth = scrollParent.getBoundingClientRect().width

    return viewportWidth > 0 ? resolveMessageColumnWidth(viewportWidth) : null
}

function estimateTextHeight(text: string, messageColumnWidth: number): number {
    const codeBlocks: string[] = text.match(/```[\s\S]*?```/g) ?? []
    const textWithoutCodeBlocks = text.replace(/```[\s\S]*?```/g, '')
    const markdownTableRows: string[] = textWithoutCodeBlocks.match(/^\s*\|.*\|\s*$/gm) ?? []
    const proseText = textWithoutCodeBlocks
        .split('\n')
        .filter(line => !/^\s*\|.*\|\s*$/.test(line))
        .join('\n')
    const paragraphText = proseText
        .split('\n')
        .filter(line => line.trim().length > 0 && !/^#{1,6}\s+/.test(line) && !/^(?:[-*+] |\d+\. )/.test(line))
        .join('\n')
    const charactersPerLine = Math.max(18, Math.floor((messageColumnWidth - 32) / 8))
    const visualLineCount = paragraphText.split('\n').reduce((lineCount, line) => {
        const visualCharacterCount = Array.from(line).reduce(
            (characterCount, character) => characterCount + (WIDE_TEXT_CHARACTER_PATTERN.test(character) ? 2 : 1),
            0
        )

        return lineCount + Math.max(1, Math.ceil(visualCharacterCount / charactersPerLine))
    }, 0)
    const codeBlockLineCount = codeBlocks.reduce((lineCount, block) => lineCount + block.split('\n').length, 0)
    const tableDataRowCount = markdownTableRows.filter(row => !/^\s*\|?[\s:|-]+\|?\s*$/.test(row)).length
    const headingCount = proseText.match(/^#{1,6}\s+/gm)?.length ?? 0
    const listItemCount = proseText.match(/^(?:[-*+] |\d+\. )/gm)?.length ?? 0
    const paragraphBreakCount = proseText.match(/\n\s*\n/g)?.length ?? 0

    return (
        20 +
        Math.min(MAX_ESTIMATED_TEXT_LINE_COUNT, visualLineCount) * TEXT_LINE_HEIGHT +
        codeBlockLineCount * 17 +
        codeBlocks.length * 28 +
        tableDataRowCount * 37 +
        headingCount * 32 +
        Math.min(40, listItemCount) * 40 +
        Math.min(16, paragraphBreakCount) * 16
    )
}

function estimateImageResultHeight(width: number | undefined, height: number | undefined, messageColumnWidth: number): number {
    const imageWidth = Math.max(208, Math.min(824, messageColumnWidth - 32))
    const ratio = width && height ? width / height : 1

    return Math.round(imageWidth / ratio) + 156
}

function estimateMessageHeight(message: MindMessage, messageColumnWidth: number, context: MessageHeightEstimateContext): number {
    if (message.role === 'user') {
        const text = message.parts
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('\n')
        return Math.min(280, 32 + estimateTextHeight(text, messageColumnWidth) + MESSAGE_ITEM_VERTICAL_PADDING)
    }

    let estimatedHeight = message.artifacts?.length ? 128 : 0
    const isDeliveryChainMessage = context.requestComposer?.command?.name === 'delivery-chain'

    for (const part of message.parts) {
        if (!hasVisibleContent(part)) {
            continue
        }

        switch (part.type) {
            case 'text':
                estimatedHeight += estimateTextHeight(part.text, messageColumnWidth)
                break
            case 'reasoning':
                if (context.enableReasoning) {
                    estimatedHeight += part.visibility === 'expanded' ? 56 + estimateTextHeight(part.text, messageColumnWidth) : 56
                }
                break
            case 'tool':
                estimatedHeight += 274 + estimateTextHeight(`${part.input}\n${part.output ?? part.error ?? ''}`, messageColumnWidth)
                break
            case 'resource':
                estimatedHeight += 336 + estimateTextHeight(part.contentPreview ?? part.error ?? '', messageColumnWidth)
                break
            case 'skill':
            case 'thread-memory-status':
                estimatedHeight += 56
                break
            case 'prompt':
                estimatedHeight += 228 + estimateTextHeight(part.input ?? part.error ?? '', messageColumnWidth)
                break
            case 'workflow-progress':
                if (isDeliveryChainMessage || part.workflowKind === 'image_generation') {
                    estimatedHeight += part.visibility === 'expanded' ? 144 + part.steps.length * 64 : 60
                }
                break
            case 'image-brief':
                estimatedHeight += 200
                break
            case 'image-result':
                estimatedHeight += estimateImageResultHeight(part.width, part.height, messageColumnWidth)
                break
            case 'agent-step':
                estimatedHeight += 198 + Math.min(6, part.graph.nodes.length) * 32
                break
            case 'agent-interrupt':
                estimatedHeight += 160
                break
        }
    }

    return Math.min(MAX_ESTIMATED_MESSAGE_HEIGHT, Math.max(64, estimatedHeight + MESSAGE_ITEM_VERTICAL_PADDING))
}

const ChatMessageItem = memo(function ChatMessageItem({
    conversationId,
    disclosureScopeKey,
    enableReasoning,
    feedbackState,
    isAssistantReplyCompleted,
    isCopied,
    isDeleteDisabled,
    isLatestAssistantMessage,
    isThinking,
    message,
    requestComposer,
    onCopy,
    onDeleteUserTurn,
    onFeedbackChange,
    onRegenerateLastTurn,
    onSelectFollowUpQuestion,
    followUpSuggestionsDisabled,
    showFollowUpSuggestions,
}: {
    conversationId?: string
    disclosureScopeKey: string
    enableReasoning: boolean
    feedbackState: AssistantFeedback
    isAssistantReplyCompleted: boolean
    isCopied: boolean
    isDeleteDisabled: boolean
    isLatestAssistantMessage: boolean
    isThinking: boolean
    message: MindMessage
    requestComposer?: ChatComposerPayload
    onCopy: (message: MindMessage) => void
    onDeleteUserTurn: (userMessageId: string) => boolean
    onFeedbackChange: (messageId: string, feedback: 'up' | 'down') => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectFollowUpQuestion: (question: string) => void
    followUpSuggestionsDisabled: boolean
    showFollowUpSuggestions: boolean
}) {
    const visibleParts = useMemo(() => message.parts.filter(hasVisibleContent), [message.parts])
    const hasArtifacts = (message.artifacts?.length ?? 0) > 0
    const reasoningParts = useMemo(
        () => (enableReasoning ? visibleParts.filter((part): part is ReasoningPart => part.type === 'reasoning') : []),
        [enableReasoning, visibleParts]
    )
    const contentParts = useMemo(() => visibleParts.filter(part => part.type !== 'reasoning'), [visibleParts])
    const combinedReasoning = useMemo(() => buildCombinedReasoning(reasoningParts), [reasoningParts])
    const messageTextContent = useMemo(() => getMessageTextContent(message), [message])
    const hasTextContent = messageTextContent.trim().length > 0
    // 深度思考的 chunk 可能晚于 Skill/Resource 卡片到达，先预留顶部位置，避免后续插入时把内容整体顶下去。
    const reserveReasoningSpace = enableReasoning && isThinking && combinedReasoning.length === 0

    if (message.role === 'user') {
        return (
            <UserMessage
                message={message}
                isCopied={isCopied}
                isDeleteDisabled={isDeleteDisabled}
                onCopy={onCopy}
                onDelete={onDeleteUserTurn}
            />
        )
    }

    if (visibleParts.length === 0 && !hasArtifacts) {
        if (message.role === 'assistant' && isThinking) {
            return (
                <article className="flex justify-start">
                    <div className="inline-flex items-center py-1 text-sm font-medium text-muted-foreground">
                        <ThinkingText />
                    </div>
                </article>
            )
        }

        return null
    }

    return (
        <AssistantMessage
            conversationId={conversationId}
            disclosureScopeKey={disclosureScopeKey}
            message={message}
            requestComposer={requestComposer}
            combinedReasoning={combinedReasoning}
            contentParts={contentParts}
            feedbackState={feedbackState}
            hasTextContent={hasTextContent}
            isAssistantReplyCompleted={isAssistantReplyCompleted}
            isCopied={isCopied}
            isLatestAssistantMessage={isLatestAssistantMessage}
            isThinking={isThinking}
            onCopy={onCopy}
            onFeedbackChange={onFeedbackChange}
            onRegenerateLastTurn={onRegenerateLastTurn}
            onSelectFollowUpQuestion={onSelectFollowUpQuestion}
            reserveReasoningSpace={reserveReasoningSpace}
            followUpSuggestionsDisabled={followUpSuggestionsDisabled}
            showFollowUpSuggestions={showFollowUpSuggestions}
        />
    )
})

export function ChatMessageList({
    ref,
    actionsDisabled = false,
    bottomInset = 0,
    conversationId,
    messages,
    status,
    enableReasoning,
    showEmptyStateSuggestions = true,
    onDeleteUserTurn,
    onItemMounted,
    onItemUnmounted,
    onRegenerateLastTurn,
    onAtBottomChange,
    onRangeChange,
    onScrollingChange,
    onHeightHintBootstrapChange,
    onSelectFollowUpQuestion,
    onSelectSuggestion,
    onTotalHeightChange,
    scrollParent,
}: {
    ref?: Ref<ChatMessageListHandle>
    actionsDisabled?: boolean
    bottomInset?: number
    conversationId?: string
    enableReasoning: boolean
    messages: MindMessage[]
    status: ChatListStatus
    showEmptyStateSuggestions?: boolean
    onDeleteUserTurn: (userMessageId: string) => boolean
    onItemMounted?: (itemIndex: number) => void
    onItemUnmounted?: (itemIndex: number) => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onAtBottomChange?: (atBottom: boolean) => void
    onHeightHintBootstrapChange?: (isPending: boolean) => void
    onRangeChange?: (range: ListRange) => void
    onScrollingChange?: (isScrolling: boolean) => void
    onSelectFollowUpQuestion: (question: string) => void
    onSelectSuggestion: (suggestion: EmptyStateSuggestion) => void
    onTotalHeightChange?: (height: number) => void
    scrollParent?: HTMLElement | null
}) {
    const virtuosoRef = useRef<VirtuosoHandle>(null)
    const copyResetTimeoutRef = useRef<number | null>(null)
    const onDeleteUserTurnRef = useRef(onDeleteUserTurn)
    const onRegenerateLastTurnRef = useRef(onRegenerateLastTurn)
    const onSelectFollowUpQuestionRef = useRef(onSelectFollowUpQuestion)
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [assistantFeedback, setAssistantFeedback] = useState<Record<string, AssistantFeedback>>({})
    const [messageColumnWidth, setMessageColumnWidth] = useState(DEFAULT_MESSAGE_COLUMN_WIDTH)
    const [heightHintReadState, setHeightHintReadState] = useState<MessageHeightHintReadState>({
        entries: [],
        requestKey: null,
        status: 'idle',
    })
    const disclosureMessageIdsRef = useRef<ReadonlySet<string>>(new Set())
    const heightHintCandidatesRef = useRef<Map<string, MessageHeightHintCandidate>>(new Map())
    const heightHintEntriesRef = useRef<Map<string, LocalMessageHeightHintEntry>>(new Map())
    const heightHintPersistedSignaturesRef = useRef<Map<string, string>>(new Map())
    const heightHintRuntimeRef = useRef<MessageHeightHintRuntime>({
        entriesByMessageId: new Map(),
        isBusy: false,
        layoutKey: '',
        messageColumnWidth: 0,
        ready: false,
        requestKey: null,
    })
    const heightHintFlushFrameRef = useRef<number | null>(null)
    const heightHintWritePendingRef = useRef(false)
    const isMessageListMountedRef = useRef(true)
    const virtuosoScrollingRef = useRef(false)

    useLayoutEffect(() => {
        if (!scrollParent) {
            return
        }

        const updateMessageColumnWidth = () => {
            const nextWidth = resolveMeasuredMessageColumnWidth(scrollParent)

            if (nextWidth === null) {
                return
            }

            setMessageColumnWidth(currentWidth => (currentWidth === nextWidth ? currentWidth : nextWidth))
        }

        updateMessageColumnWidth()

        if (!window.ResizeObserver) {
            return
        }

        const resizeObserver = new ResizeObserver(updateMessageColumnWidth)
        resizeObserver.observe(scrollParent)
        const messageColumn = scrollParent.querySelector<HTMLElement>('[data-slot="chat-main-column"]')

        if (messageColumn) {
            resizeObserver.observe(messageColumn)
        }

        return () => resizeObserver.disconnect()
    }, [scrollParent])

    useEffect(() => {
        onDeleteUserTurnRef.current = onDeleteUserTurn
        onRegenerateLastTurnRef.current = onRegenerateLastTurn
        onSelectFollowUpQuestionRef.current = onSelectFollowUpQuestion
    }, [onDeleteUserTurn, onRegenerateLastTurn, onSelectFollowUpQuestion])

    useEffect(() => {
        isMessageListMountedRef.current = true

        return () => {
            isMessageListMountedRef.current = false

            if (copyResetTimeoutRef.current) {
                window.clearTimeout(copyResetTimeoutRef.current)
            }

            if (heightHintFlushFrameRef.current !== null) {
                window.cancelAnimationFrame(heightHintFlushFrameRef.current)
            }
        }
    }, [])

    const handleCopy = useCallback(async (message: MindMessage) => {
        const text = getMessageCopyText(message).trim()
        if (!text) {
            return
        }

        await copyTextToClipboard(text)
        setCopiedMessageId(message.id)

        if (copyResetTimeoutRef.current) {
            window.clearTimeout(copyResetTimeoutRef.current)
        }

        copyResetTimeoutRef.current = window.setTimeout(() => {
            setCopiedMessageId(current => (current === message.id ? null : current))
        }, 1500)
    }, [])

    const toggleAssistantFeedback = useCallback((messageId: string, nextFeedback: 'up' | 'down') => {
        setAssistantFeedback(current => ({
            ...current,
            [messageId]: current[messageId] === nextFeedback ? null : nextFeedback,
        }))
    }, [])

    const handleCopyMessage = useCallback(
        (message: MindMessage) => {
            void handleCopy(message)
        },
        [handleCopy]
    )

    const handleDeleteUserTurn = useCallback((userMessageId: string) => onDeleteUserTurnRef.current(userMessageId), [])

    const handleRegenerateLastTurn = useCallback(() => onRegenerateLastTurnRef.current(), [])

    const handleSelectFollowUpQuestion = useCallback((question: string) => {
        onSelectFollowUpQuestionRef.current(question)
    }, [])

    const isBusy = actionsDisabled || status === 'submitted' || status === 'streaming'
    const heightHintLayoutKey = useMemo(
        () => createMessageHeightHintLayoutKey({ enableReasoning, messageColumnWidth }),
        [enableReasoning, messageColumnWidth]
    )
    const heightHintRequestKey = conversationId && scrollParent && messages.length > 0 ? `${conversationId}::${heightHintLayoutKey}` : null
    const areHeightHintsReady =
        !heightHintRequestKey || (heightHintReadState.requestKey === heightHintRequestKey && heightHintReadState.status === 'ready')

    useLayoutEffect(() => {
        onHeightHintBootstrapChange?.(!areHeightHintsReady && messages.length > 0)
    }, [areHeightHintsReady, messages.length, onHeightHintBootstrapChange])

    useEffect(() => {
        if (!heightHintRequestKey || !conversationId) {
            setHeightHintReadState(current =>
                current.status === 'idle' && current.requestKey === null ? current : { entries: [], requestKey: null, status: 'idle' }
            )
            return
        }

        let isCurrentRequest = true
        let isSettled = false

        const completeRead = (entries: LocalMessageHeightHintEntry[]) => {
            if (!isCurrentRequest || isSettled) {
                return
            }

            isSettled = true

            window.clearTimeout(timeoutId)

            setHeightHintReadState({ entries, requestKey: heightHintRequestKey, status: 'ready' })
        }

        setHeightHintReadState(current =>
            current.requestKey === heightHintRequestKey && current.status === 'loading'
                ? current
                : { entries: [], requestKey: heightHintRequestKey, status: 'loading' }
        )

        const timeoutId = window.setTimeout(() => completeRead([]), HEIGHT_HINT_READ_TIMEOUT_MS)

        void readLocalMessageHeightHints(conversationId, heightHintLayoutKey)
            .then(result => {
                const entries =
                    result.status === 'valid' &&
                    result.data.geometryVersion === 1 &&
                    result.data.messageColumnWidth === messageColumnWidth &&
                    result.data.layoutKey === heightHintLayoutKey
                        ? result.data.entries
                        : []

                completeRead(entries)
            })
            .catch(() => completeRead([]))

        return () => {
            isCurrentRequest = false
            window.clearTimeout(timeoutId)
        }
    }, [conversationId, heightHintLayoutKey, heightHintRequestKey, messageColumnWidth])

    const { heightEstimates, messageEntries } = useMemo(() => {
        const entries: MessageEntry[] = []
        const structuralEstimates: number[] = []
        let latestUserComposer: ChatComposerPayload | undefined

        for (const message of messages) {
            if (message.role === 'user') {
                latestUserComposer = message.composer
            }

            const entry = {
                message,
                renderFingerprint: createMessageRenderFingerprint(message, message.role === 'assistant' ? latestUserComposer : undefined),
                requestComposer: message.role === 'assistant' ? latestUserComposer : undefined,
            }

            entries.push(entry)
            structuralEstimates.push(
                estimateMessageHeight(message, messageColumnWidth, { enableReasoning, requestComposer: entry.requestComposer })
            )
        }

        return {
            heightEstimates: mergeMessageHeightHints(
                entries.map((entry, index) => ({
                    estimatedHeight: structuralEstimates[index] ?? 0,
                    messageId: entry.message.id,
                    renderFingerprint: entry.renderFingerprint,
                })),
                areHeightHintsReady ? heightHintReadState.entries : []
            ),
            messageEntries: entries,
        }
    }, [areHeightHintsReady, enableReasoning, heightHintReadState.entries, messageColumnWidth, messages])

    const messageEntriesByMessageId = useMemo(() => new Map(messageEntries.map(entry => [entry.message.id, entry])), [messageEntries])

    heightHintRuntimeRef.current = {
        conversationId,
        entriesByMessageId: messageEntriesByMessageId,
        isBusy,
        layoutKey: heightHintLayoutKey,
        latestAssistantMessageId: messageEntries.at(-1)?.message.role === 'assistant' ? messageEntries.at(-1)?.message.id : undefined,
        messageColumnWidth,
        ready: areHeightHintsReady,
        requestKey: heightHintRequestKey,
    }

    useEffect(() => {
        if (!areHeightHintsReady || !heightHintRequestKey) {
            heightHintCandidatesRef.current.clear()
            heightHintEntriesRef.current.clear()
            heightHintPersistedSignaturesRef.current.clear()
            return
        }

        const entries = new Map(heightHintReadState.entries.map(entry => [entry.messageId, entry]))
        heightHintCandidatesRef.current.clear()
        heightHintEntriesRef.current = entries
        heightHintPersistedSignaturesRef.current = new Map(
            Array.from(entries.values(), entry => [entry.messageId, `${entry.renderFingerprint}:${entry.height}`])
        )
    }, [areHeightHintsReady, heightHintReadState.entries, heightHintRequestKey])

    const listContext = useMemo(() => ({ bottomInset, onItemMounted, onItemUnmounted }), [bottomInset, onItemMounted, onItemUnmounted])
    const disclosureScopeKey = conversationId ?? 'draft'
    const { disclosureMessageIdByKey, validDisclosureKeys } = useMemo(() => {
        const keys = new Set<string>()
        const messageIdByKey = new Map<string, string>()

        const addDisclosureKey = (messageId: string, slotKey: string) => {
            const key = createMessageDisclosureKey(disclosureScopeKey, messageId, slotKey)
            keys.add(key)
            messageIdByKey.set(key, messageId)
        }

        for (const message of messages) {
            const reasoningIdentities = message.parts.flatMap((part, partIndex) =>
                part.type === 'reasoning' ? [getDisclosurePartIdentity(part, partIndex)] : []
            )

            if (reasoningIdentities.length > 0) {
                addDisclosureKey(message.id, `reasoning:${reasoningIdentities.join('|')}`)
            }

            message.parts.forEach((part, partIndex) => {
                const identity = getDisclosurePartIdentity(part, partIndex)

                if (part.type === 'agent-step') {
                    addDisclosureKey(message.id, `${identity}:agent-main`)
                    addDisclosureKey(message.id, `${identity}:agent-debug`)
                } else if (part.type === 'workflow-progress') {
                    addDisclosureKey(message.id, `${identity}:workflow`)
                } else if (part.type === 'resource') {
                    addDisclosureKey(message.id, `${identity}:resource-raw`)
                } else if (part.type === 'tool') {
                    addDisclosureKey(message.id, `${identity}:tool-input-raw`)
                    addDisclosureKey(message.id, `${identity}:tool-output-raw`)
                }
            })

            addDisclosureKey(message.id, 'delivery-summary')
            addDisclosureKey(message.id, 'delivery-debug')
        }

        return { disclosureMessageIdByKey: messageIdByKey, validDisclosureKeys: keys }
    }, [disclosureScopeKey, messages])

    const handleDisclosureDeviationKeysChange = useCallback(
        (keys: ReadonlySet<string>) => {
            const disclosureMessageIds = new Set(
                Array.from(keys, key => disclosureMessageIdByKey.get(key)).filter((messageId): messageId is string => Boolean(messageId))
            )

            disclosureMessageIdsRef.current = disclosureMessageIds

            for (const messageId of disclosureMessageIds) {
                heightHintCandidatesRef.current.delete(messageId)
            }
        },
        [disclosureMessageIdByKey]
    )

    const scheduleHeightHintPersistence = useCallback(() => {
        if (heightHintFlushFrameRef.current !== null) {
            return
        }

        heightHintFlushFrameRef.current = window.requestAnimationFrame(() => {
            heightHintFlushFrameRef.current = null

            void (async () => {
                const initialRuntime = heightHintRuntimeRef.current

                if (
                    heightHintWritePendingRef.current ||
                    !isMessageListMountedRef.current ||
                    initialRuntime.isBusy ||
                    !initialRuntime.ready ||
                    !initialRuntime.requestKey ||
                    !initialRuntime.conversationId ||
                    virtuosoScrollingRef.current
                ) {
                    return
                }

                try {
                    await document.fonts?.ready
                } catch {
                    // 字体状态不可用时继续使用已由 Virtuoso 稳定两次的尺寸。
                }

                const runtime = heightHintRuntimeRef.current

                if (
                    heightHintWritePendingRef.current ||
                    !isMessageListMountedRef.current ||
                    runtime.isBusy ||
                    !runtime.ready ||
                    !runtime.requestKey ||
                    !runtime.conversationId ||
                    runtime.requestKey !== initialRuntime.requestKey ||
                    virtuosoScrollingRef.current
                ) {
                    return
                }

                const nextEntries = new Map<string, LocalMessageHeightHintEntry>()
                const now = new Date().toISOString()
                let hasChanges = false

                for (const [messageId, existingEntry] of heightHintEntriesRef.current) {
                    const currentEntry = runtime.entriesByMessageId.get(messageId)

                    if (currentEntry?.renderFingerprint === existingEntry.renderFingerprint) {
                        nextEntries.set(messageId, existingEntry)
                    }
                }

                for (const [messageId, candidate] of heightHintCandidatesRef.current) {
                    const entry = runtime.entriesByMessageId.get(messageId)

                    if (
                        !entry ||
                        candidate.observationCount < 2 ||
                        candidate.renderFingerprint !== entry.renderFingerprint ||
                        disclosureMessageIdsRef.current.has(messageId) ||
                        entry.message.id === runtime.latestAssistantMessageId
                    ) {
                        continue
                    }

                    const signature = `${candidate.renderFingerprint}:${candidate.height}`

                    if (heightHintPersistedSignaturesRef.current.get(messageId) === signature) {
                        continue
                    }

                    nextEntries.set(messageId, {
                        height: candidate.height,
                        measuredAt: now,
                        messageId,
                        presentation: 'history-default',
                        renderFingerprint: candidate.renderFingerprint,
                    })
                    hasChanges = true
                }

                if (!hasChanges) {
                    return
                }

                const entries = Array.from(nextEntries.values()).slice(-LOCAL_MESSAGE_HEIGHT_HINT_MAX_ENTRIES)
                heightHintWritePendingRef.current = true
                try {
                    const writeResult = await writeLocalMessageHeightHints({
                        conversationId: runtime.conversationId,
                        entries,
                        geometryVersion: MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION,
                        key: runtime.requestKey,
                        layoutKey: runtime.layoutKey,
                        messageColumnWidth: runtime.messageColumnWidth,
                        updatedAt: now,
                    })

                    if (writeResult.status === 'written' && heightHintRuntimeRef.current.requestKey === runtime.requestKey) {
                        heightHintEntriesRef.current = new Map(entries.map(entry => [entry.messageId, entry]))
                        heightHintPersistedSignaturesRef.current = new Map(
                            entries.map(entry => [entry.messageId, `${entry.renderFingerprint}:${entry.height}`])
                        )
                    }
                } catch {
                    // 性能提示写入失败不影响当前历史展示或后续结构化估值。
                } finally {
                    heightHintWritePendingRef.current = false
                }
            })()
        })
    }, [])

    const handleItemsRendered = useCallback(
        (items: ListItem<MessageEntry>[]) => {
            const runtime = heightHintRuntimeRef.current

            if (!runtime.ready || runtime.isBusy || !runtime.requestKey || !runtime.conversationId) {
                return
            }

            for (const item of items) {
                const entry = item.data

                if (!entry || entry.message.id === runtime.latestAssistantMessageId) {
                    continue
                }

                if (disclosureMessageIdsRef.current.has(entry.message.id)) {
                    heightHintCandidatesRef.current.delete(entry.message.id)
                    continue
                }

                const candidate = observeMessageHeightHintCandidate(heightHintCandidatesRef.current.get(entry.message.id), {
                    height: item.size,
                    renderFingerprint: entry.renderFingerprint,
                })

                if (candidate) {
                    heightHintCandidatesRef.current.set(entry.message.id, candidate)
                } else {
                    heightHintCandidatesRef.current.delete(entry.message.id)
                }
            }

            scheduleHeightHintPersistence()
        },
        [scheduleHeightHintPersistence]
    )

    const handleScrollingChange = useCallback(
        (isScrolling: boolean) => {
            virtuosoScrollingRef.current = isScrolling
            onScrollingChange?.(isScrolling)

            if (!isScrolling) {
                scheduleHeightHintPersistence()
            }
        },
        [onScrollingChange, scheduleHeightHintPersistence]
    )

    useImperativeHandle(
        ref,
        () => ({
            scrollToEnd(behavior) {
                if (messageEntries.length === 0) {
                    return
                }

                virtuosoRef.current?.scrollToIndex({
                    align: 'end',
                    behavior,
                    index: 'LAST',
                    offset: bottomInset,
                })
            },
        }),
        [bottomInset, messageEntries.length]
    )

    const renderMessage = useCallback(
        (messageIndex: number, { message, requestComposer }: MessageEntry) => {
            const isCopied = copiedMessageId === message.id
            const feedbackState = assistantFeedback[message.id] ?? null
            const isLatestAssistantMessage = message.role === 'assistant' && messageIndex === messageEntries.length - 1
            const isAssistantReplyCompleted = !isLatestAssistantMessage || !isBusy
            const isThinking = isLatestAssistantMessage && !isAssistantReplyCompleted
            const hasImageResult = message.parts.some(part => part.type === 'image-result')
            const showFollowUpSuggestions =
                isLatestAssistantMessage &&
                status === 'ready' &&
                message.status !== 'failed' &&
                (getMessageTextContent(message).trim().length > 0 || hasImageResult)

            return (
                <ChatMessageItem
                    conversationId={conversationId}
                    disclosureScopeKey={disclosureScopeKey}
                    enableReasoning={enableReasoning}
                    message={message}
                    requestComposer={requestComposer}
                    isCopied={isCopied}
                    isDeleteDisabled={message.role === 'user' && isBusy}
                    isLatestAssistantMessage={isLatestAssistantMessage}
                    isAssistantReplyCompleted={isAssistantReplyCompleted}
                    isThinking={isThinking}
                    feedbackState={feedbackState}
                    onCopy={handleCopyMessage}
                    onDeleteUserTurn={handleDeleteUserTurn}
                    onFeedbackChange={toggleAssistantFeedback}
                    onRegenerateLastTurn={handleRegenerateLastTurn}
                    onSelectFollowUpQuestion={handleSelectFollowUpQuestion}
                    followUpSuggestionsDisabled={isLatestAssistantMessage && actionsDisabled}
                    showFollowUpSuggestions={showFollowUpSuggestions}
                />
            )
        },
        [
            actionsDisabled,
            assistantFeedback,
            conversationId,
            disclosureScopeKey,
            copiedMessageId,
            enableReasoning,
            handleCopyMessage,
            handleDeleteUserTurn,
            handleRegenerateLastTurn,
            handleSelectFollowUpQuestion,
            isBusy,
            messageEntries.length,
            status,
            toggleAssistantFeedback,
        ]
    )

    if (messageEntries.length === 0) {
        return (
            <div className="flex min-h-0 flex-col py-2" style={{ paddingBottom: `${bottomInset}px` }}>
                {showEmptyStateSuggestions ? (
                    <EmptyStateSuggestions
                        disabled={isBusy}
                        onSelectQuestion={handleSelectFollowUpQuestion}
                        onSelectSuggestion={onSelectSuggestion}
                    />
                ) : null}
            </div>
        )
    }

    if (!areHeightHintsReady) {
        return null
    }

    return (
        <MessageDisclosureProvider
            key={disclosureScopeKey}
            onDeviationKeysChange={handleDisclosureDeviationKeysChange}
            scopeKey={disclosureScopeKey}
            validKeys={validDisclosureKeys}
        >
            <Virtuoso
                ref={virtuosoRef}
                alignToBottom
                atBottomStateChange={onAtBottomChange}
                atBottomThreshold={120}
                components={messageListComponents}
                computeItemKey={computeMessageItemKey}
                context={listContext}
                customScrollParent={scrollParent ?? undefined}
                data={messageEntries}
                followOutput={false}
                heightEstimates={heightEstimates}
                increaseViewportBy={{ top: 600, bottom: 400 }}
                initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
                isScrolling={handleScrollingChange}
                itemContent={renderMessage}
                itemsRendered={handleItemsRendered}
                minOverscanItemCount={{ top: 2, bottom: 2 }}
                rangeChanged={onRangeChange}
                totalListHeightChanged={onTotalHeightChange}
            />
        </MessageDisclosureProvider>
    )
}
