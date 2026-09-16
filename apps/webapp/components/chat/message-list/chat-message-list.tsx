'use client'

import {
    memo,
    type ReactNode,
    type Ref,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
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
import { GeneralAgentTracePanel } from './parts/general-agent/general-agent-trace-panel'
import {
    type AssistantFeedback,
    buildCombinedReasoning,
    type ChatListStatus,
    getMessageCopyText,
    getMessageTextContent,
    hasVisibleContent,
} from './shared/message-list-utils'
import type { EmptyStateSuggestion } from './suggestions/empty-state-suggestion-options'
import { EmptyStateSuggestions } from './suggestions/empty-state-suggestions'

interface MessageEntry {
    kind: 'message'
    itemKey?: string
    message: MindMessage
    renderFingerprint: string
    requestComposer?: ChatComposerPayload
}

interface TurnEntry {
    assistantMessage?: MindMessage
    kind: 'turn'
    itemKey: string
    renderFingerprint: string
    requestComposer?: ChatComposerPayload
    userMessage: MindMessage
}

type MessageListEntry = MessageEntry | TurnEntry

const DEFAULT_MESSAGE_COLUMN_WIDTH = 856
const HEIGHT_HINT_READ_TIMEOUT_MS = 500
const MESSAGE_ITEM_VERTICAL_PADDING = 20
const TEXT_LINE_HEIGHT = 28
const ACCEPTED_TURN_RESPONSE_RESERVE_HEIGHT = 288
const GENERAL_AGENT_TRACE_HEADER_HEIGHT = 30
const GENERAL_AGENT_TRACE_MARGIN = 12
const GENERAL_AGENT_TRACE_ROW_HEIGHT = 30

function InitialGeneralAgentTrace() {
    return (
        <article className="flex justify-start">
            <div className="flow-root w-full max-w-[var(--chat-content-column-width,51rem)] text-foreground">
                <GeneralAgentTracePanel finalAnswerStarted={false} parts={[]} />
            </div>
        </article>
    )
}

function isDedicatedAgentRequest(requestComposer: ChatComposerPayload | undefined) {
    const commandName = requestComposer?.command?.name

    return commandName === 'tasklist' || commandName === 'delivery-chain' || commandName === 'image'
}

const GENERAL_AGENT_TRACE_CONTENT_TOP = 8
const GENERAL_AGENT_TRACE_SOURCE_SEPARATOR_HEIGHT = 12
const GENERAL_AGENT_TRACE_SOURCE_HEADER_HEIGHT = 20
const GENERAL_AGENT_TRACE_SOURCE_LINK_HEIGHT = 16
const WIDE_TEXT_CHARACTER_PATTERN = /[\u1100-\u115f\u2e80-\ua4cf\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/

interface MessageListContext {
    acceptedTurnResponseReserveItemKey?: string
    acceptedTurnResponseReserveMode?: 'assistant-slot' | 'assistant-message'
    bottomInset: number
    header?: ReactNode
    onUserReading?: () => void
    onItemMounted?: (itemIndex: number) => void
    onItemUnmounted?: (itemIndex: number) => void
}

interface MessageHeightEstimateContext {
    enableReasoning: boolean
    requestComposer?: ChatComposerPayload
}

function isGeneralAgentTracePart(part: MindMessage['parts'][number]) {
    return part.type === 'prompt' || part.type === 'resource' || part.type === 'skill' || part.type === 'tool'
}

function countGeneralAgentReadSources(parts: MindMessage['parts']) {
    const readUrls = new Set<string>()

    for (const part of parts) {
        if (part.type !== 'tool') continue

        for (const source of part.sources ?? []) {
            if (source.originTool !== 'read-url' || source.status !== 'read') continue

            try {
                const url = new URL(source.url)

                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    url.hash = ''
                    readUrls.add(url.toString())
                }
            } catch {
                // Invalid source URLs are not rendered in the trace source list.
            }
        }
    }

    return Math.min(5, readUrls.size)
}

function estimateGeneralAgentTraceHeight(parts: MindMessage['parts']) {
    let height = GENERAL_AGENT_TRACE_HEADER_HEIGHT + GENERAL_AGENT_TRACE_MARGIN
    const rows = parts.filter(isGeneralAgentTracePart)

    if (parts.some(part => part.type === 'text' && part.text.trim().length > 0)) {
        return height
    }

    if (rows.length > 0) {
        height += GENERAL_AGENT_TRACE_CONTENT_TOP + rows.length * GENERAL_AGENT_TRACE_ROW_HEIGHT
    }

    const readSourceCount = countGeneralAgentReadSources(parts)

    if (readSourceCount > 0) {
        height +=
            GENERAL_AGENT_TRACE_SOURCE_SEPARATOR_HEIGHT +
            GENERAL_AGENT_TRACE_SOURCE_HEADER_HEIGHT +
            readSourceCount * GENERAL_AGENT_TRACE_SOURCE_LINK_HEIGHT
    }

    return height
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
    streamingAssistantMessageId?: string
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
    item,
    style,
    ...props
}: ItemProps<MessageListEntry> & { context?: MessageListContext }) {
    const onItemMounted = context?.onItemMounted
    const onItemUnmounted = context?.onItemUnmounted
    const itemKey = computeMessageItemKey(itemIndex, item)
    const acceptedTurnResponseReserveMode =
        context?.acceptedTurnResponseReserveItemKey === itemKey ? context.acceptedTurnResponseReserveMode : undefined
    const itemStyle = {
        ...style,
        minHeight: acceptedTurnResponseReserveMode === 'assistant-message' ? `${ACCEPTED_TURN_RESPONSE_RESERVE_HEIGHT}px` : undefined,
        paddingBlock: item.kind === 'turn' ? 0 : '0.625rem',
    }

    useLayoutEffect(() => {
        onItemMounted?.(itemIndex)

        return () => onItemUnmounted?.(itemIndex)
    }, [itemIndex, onItemMounted, onItemUnmounted])

    return (
        <div
            {...props}
            data-item-index={itemIndex}
            style={itemStyle}
            onClickCapture={event => {
                if (event.defaultPrevented || !(event.target instanceof Element)) return
                const trigger = event.target.closest('summary, button[aria-expanded="false"]')
                if (
                    trigger &&
                    event.currentTarget.contains(trigger) &&
                    (trigger.tagName !== 'SUMMARY' || !trigger.closest('details')?.open)
                ) {
                    context?.onUserReading?.()
                }
            }}
        >
            {children}
        </div>
    )
}

function MessageListFooter({ context }: { context?: MessageListContext }) {
    return <div aria-hidden="true" style={{ height: `${context?.bottomInset ?? 0}px` }} />
}

function MessageListHeader({ context }: { context?: MessageListContext }) {
    return <div className="flow-root">{context?.header}</div>
}

const messageListComponents: Components<MessageListEntry, MessageListContext> = {
    Footer: MessageListFooter,
    Header: MessageListHeader,
    Item: MessageListItem,
}

function computeMessageItemKey(_index: number, entry: MessageListEntry) {
    return entry.itemKey ?? (entry.kind === 'turn' ? entry.userMessage.id : entry.message.id)
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
        visualLineCount * TEXT_LINE_HEIGHT +
        codeBlockLineCount * 17 +
        codeBlocks.length * 28 +
        tableDataRowCount * 37 +
        headingCount * 32 +
        listItemCount * 40 +
        paragraphBreakCount * 16
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
        return 32 + estimateTextHeight(text, messageColumnWidth) + MESSAGE_ITEM_VERTICAL_PADDING
    }

    let estimatedHeight = message.artifacts?.length ? 128 : 0
    const isDeliveryChainMessage = context.requestComposer?.command?.name === 'delivery-chain'
    const isGeneralAgentMessage = message.parts.some(part => part.type === 'agent-run')

    for (const part of message.parts) {
        if (!hasVisibleContent(part)) {
            continue
        }

        if (isGeneralAgentMessage && isGeneralAgentTracePart(part)) {
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
            case 'agent-graph':
                estimatedHeight += 198 + part.graph.nodes.length * 32
                break
            case 'agent-run':
                estimatedHeight += estimateGeneralAgentTraceHeight(message.parts)
                break
            case 'agent-interrupt':
                estimatedHeight += 160
                break
        }
    }

    return Math.max(64, estimatedHeight + MESSAGE_ITEM_VERTICAL_PADDING)
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
        if (message.role === 'assistant' && isThinking && !isDedicatedAgentRequest(requestComposer)) {
            return <InitialGeneralAgentTrace />
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
    onUserReading,
    header,
    presentationKey,
    positionAcceptedTurn = false,
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
    onUserReading?: () => void
    header?: ReactNode
    presentationKey?: string
    positionAcceptedTurn?: boolean
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
    const streamingHeightEstimatesRef = useRef<Map<string, { estimate: number; layoutKey: string }>>(new Map())
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
    const totalHeightRef = useRef(0)
    const hasPresentedListRef = useRef(false)

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
    const isStreamingOutput = status === 'submitted' || status === 'streaming'
    const streamingAssistantMessageId = isStreamingOutput && messages.at(-1)?.role === 'assistant' ? messages.at(-1)?.id : undefined
    const heightHintLayoutKey = useMemo(
        () => createMessageHeightHintLayoutKey({ enableReasoning, messageColumnWidth }),
        [enableReasoning, messageColumnWidth]
    )
    const heightHintRequestKey = conversationId && scrollParent && messages.length > 0 ? `${conversationId}::${heightHintLayoutKey}` : null
    const areHeightHintsReady =
        !heightHintRequestKey || (heightHintReadState.requestKey === heightHintRequestKey && heightHintReadState.status === 'ready')
    const isHeightHintBootstrapPending = !hasPresentedListRef.current && !areHeightHintsReady
    useLayoutEffect(() => {
        if (!isHeightHintBootstrapPending && scrollParent) hasPresentedListRef.current = true
        onHeightHintBootstrapChange?.(isHeightHintBootstrapPending && messages.length > 0)
    }, [isHeightHintBootstrapPending, messages.length, onHeightHintBootstrapChange, scrollParent])

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
                    result.data.geometryVersion === MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION &&
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
        const entries: MessageListEntry[] = []
        const structuralEstimates: number[] = []
        let latestUserComposer: ChatComposerPayload | undefined
        const latestMessage = messages.at(-1)
        const previousMessage = messages.at(-2)
        const acceptedTurnUserMessage =
            positionAcceptedTurn && isStreamingOutput
                ? latestMessage?.role === 'user'
                    ? latestMessage
                    : latestMessage?.role === 'assistant' && previousMessage?.role === 'user'
                      ? previousMessage
                      : undefined
                : undefined
        const acceptedTurnAssistantMessage =
            acceptedTurnUserMessage && latestMessage?.role === 'assistant' && previousMessage?.id === acceptedTurnUserMessage.id
                ? latestMessage
                : undefined
        const activeStreamingAssistantId = streamingAssistantMessageId
        const activeMessageIds = new Set(messages.map(message => message.id))

        for (const messageId of streamingHeightEstimatesRef.current.keys()) {
            if (!activeMessageIds.has(messageId)) {
                streamingHeightEstimatesRef.current.delete(messageId)
            }
        }

        for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
            const message = messages[messageIndex]

            if (acceptedTurnUserMessage?.id === message.id) {
                const assistantMessage = acceptedTurnAssistantMessage
                const userMessage = message
                const turnEntry: TurnEntry = {
                    assistantMessage,
                    itemKey: userMessage.id,
                    kind: 'turn',
                    renderFingerprint: createMessageRenderFingerprint(
                        assistantMessage ?? userMessage,
                        assistantMessage ? userMessage.composer : undefined
                    ),
                    requestComposer: userMessage.composer,
                    userMessage,
                }

                entries.push(turnEntry)
                const frozenAssistantEstimate =
                    assistantMessage === undefined
                        ? 0
                        : assistantMessage.id === activeStreamingAssistantId
                          ? (() => {
                                const current = streamingHeightEstimatesRef.current.get(assistantMessage.id)
                                if (current?.layoutKey === heightHintLayoutKey) return current.estimate
                                const estimate = estimateMessageHeight(assistantMessage, messageColumnWidth, {
                                    enableReasoning,
                                    requestComposer: userMessage.composer,
                                })
                                streamingHeightEstimatesRef.current.set(assistantMessage.id, {
                                    estimate,
                                    layoutKey: heightHintLayoutKey,
                                })
                                return estimate
                            })()
                          : estimateMessageHeight(assistantMessage, messageColumnWidth, {
                                enableReasoning,
                                requestComposer: userMessage.composer,
                            })
                structuralEstimates.push(
                    estimateMessageHeight(userMessage, messageColumnWidth, { enableReasoning }) +
                        Math.max(frozenAssistantEstimate, ACCEPTED_TURN_RESPONSE_RESERVE_HEIGHT)
                )
                if (assistantMessage) messageIndex += 1
                continue
            }

            if (message.role === 'user') {
                latestUserComposer = message.composer
            }

            const entry: MessageEntry = {
                kind: 'message',
                message,
                renderFingerprint: createMessageRenderFingerprint(message, message.role === 'assistant' ? latestUserComposer : undefined),
                requestComposer: message.role === 'assistant' ? latestUserComposer : undefined,
            }

            entries.push(entry)
            const frozenEstimate =
                message.id === activeStreamingAssistantId && message.role === 'assistant'
                    ? (() => {
                          const current = streamingHeightEstimatesRef.current.get(message.id)
                          if (current?.layoutKey === heightHintLayoutKey) return current.estimate
                          const estimate = estimateMessageHeight(message, messageColumnWidth, {
                              enableReasoning,
                              requestComposer: entry.requestComposer,
                          })
                          streamingHeightEstimatesRef.current.set(message.id, { estimate, layoutKey: heightHintLayoutKey })
                          return estimate
                      })()
                    : (() => {
                          const estimate = estimateMessageHeight(message, messageColumnWidth, {
                              enableReasoning,
                              requestComposer: entry.requestComposer,
                          })
                          streamingHeightEstimatesRef.current.delete(message.id)
                          return estimate
                      })()

            structuralEstimates.push(frozenEstimate)
        }

        return {
            heightEstimates: mergeMessageHeightHints(
                entries.map((entry, index) => ({
                    estimatedHeight: structuralEstimates[index] ?? 0,
                    messageId: entry.kind === 'turn' ? entry.userMessage.id : entry.message.id,
                    renderFingerprint: entry.renderFingerprint,
                })),
                areHeightHintsReady ? heightHintReadState.entries : []
            ),
            messageEntries: entries,
        }
    }, [
        areHeightHintsReady,
        enableReasoning,
        heightHintLayoutKey,
        heightHintReadState.entries,
        isStreamingOutput,
        messageColumnWidth,
        messages,
        positionAcceptedTurn,
        streamingAssistantMessageId,
    ])

    const messageEntriesByMessageId = useMemo(
        () =>
            new Map(
                messageEntries.filter((entry): entry is MessageEntry => entry.kind === 'message').map(entry => [entry.message.id, entry])
            ),
        [messageEntries]
    )
    const acceptedTurnResponseReserveEntry = positionAcceptedTurn ? messageEntries.at(-1) : undefined
    const acceptedTurnResponseReserveMode: MessageListContext['acceptedTurnResponseReserveMode'] =
        acceptedTurnResponseReserveEntry?.kind === 'turn'
            ? 'assistant-slot'
            : acceptedTurnResponseReserveEntry?.kind === 'message' && acceptedTurnResponseReserveEntry.message.role === 'assistant'
              ? 'assistant-message'
              : undefined
    const acceptedTurnResponseReserveItemKey = acceptedTurnResponseReserveEntry
        ? computeMessageItemKey(messageEntries.length - 1, acceptedTurnResponseReserveEntry)
        : undefined

    heightHintRuntimeRef.current = {
        conversationId,
        entriesByMessageId: messageEntriesByMessageId,
        isBusy,
        layoutKey: heightHintLayoutKey,
        streamingAssistantMessageId,
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

    const listContext = useMemo(
        () => ({
            acceptedTurnResponseReserveItemKey,
            acceptedTurnResponseReserveMode,
            bottomInset,
            header,
            onItemMounted,
            onItemUnmounted,
            onUserReading,
        }),
        [
            acceptedTurnResponseReserveItemKey,
            acceptedTurnResponseReserveMode,
            bottomInset,
            header,
            onItemMounted,
            onItemUnmounted,
            onUserReading,
        ]
    )
    const disclosureScopeKey = presentationKey ?? conversationId ?? 'draft'
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

                if (part.type === 'agent-run') {
                    addDisclosureKey(message.id, 'general-agent-trace')
                } else if (part.type === 'agent-graph') {
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
                        entry.message.id === runtime.streamingAssistantMessageId
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
        (items: ListItem<MessageListEntry>[]) => {
            const runtime = heightHintRuntimeRef.current

            if (!runtime.ready || runtime.isBusy || !runtime.requestKey || !runtime.conversationId) {
                return
            }

            for (const item of items) {
                const entry = item.data

                if (!entry || entry.kind === 'turn' || entry.message.id === runtime.streamingAssistantMessageId) {
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

    const handleTotalHeightChange = useCallback(
        (totalHeight: number) => {
            totalHeightRef.current = totalHeight
            onTotalHeightChange?.(totalHeight)
        },
        [onTotalHeightChange]
    )

    useImperativeHandle(
        ref,
        () => ({
            scrollToEnd(behavior) {
                if (messageEntries.length === 0) {
                    return
                }

                // 总高已含 Header / Footer，交互命令不使用带 listRefresh 重试的索引定位。
                virtuosoRef.current?.scrollTo({ top: totalHeightRef.current, behavior })
            },
        }),
        [messageEntries.length]
    )

    const renderMessage = useCallback(
        (messageIndex: number, entry: MessageListEntry) => {
            const renderChatMessage = (message: MindMessage, isLatestAssistantMessage: boolean, requestComposer?: ChatComposerPayload) => {
                const isCopied = copiedMessageId === message.id
                const feedbackState = assistantFeedback[message.id] ?? null
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
            }

            if (entry.kind === 'turn') {
                const hasAcceptedTurnResponseReserve =
                    computeMessageItemKey(messageIndex, entry) === acceptedTurnResponseReserveItemKey &&
                    acceptedTurnResponseReserveMode === 'assistant-slot'

                return (
                    <>
                        <div className="py-2.5">{renderChatMessage(entry.userMessage, false)}</div>
                        <div
                            data-slot="assistant-loading-slot"
                            className="py-2.5"
                            style={hasAcceptedTurnResponseReserve ? { minHeight: `${ACCEPTED_TURN_RESPONSE_RESERVE_HEIGHT}px` } : undefined}
                        >
                            {entry.assistantMessage ? (
                                renderChatMessage(entry.assistantMessage, true, entry.requestComposer)
                            ) : !isDedicatedAgentRequest(entry.requestComposer) ? (
                                <InitialGeneralAgentTrace />
                            ) : null}
                        </div>
                    </>
                )
            }

            const { message, requestComposer } = entry
            const isLatestAssistantMessage = message.role === 'assistant' && messageIndex === messageEntries.length - 1

            return renderChatMessage(message, isLatestAssistantMessage, requestComposer)
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
            acceptedTurnResponseReserveItemKey,
            acceptedTurnResponseReserveMode,
            toggleAssistantFeedback,
        ]
    )

    if (messageEntries.length === 0) {
        return (
            <div className="flex min-h-0 flex-col py-2" style={{ paddingBottom: `${bottomInset}px` }}>
                {header}
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

    if (isHeightHintBootstrapPending) {
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
                atBottomThreshold={4}
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
                totalListHeightChanged={handleTotalHeightChange}
            />
        </MessageDisclosureProvider>
    )
}
