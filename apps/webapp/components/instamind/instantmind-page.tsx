'use client'

import { ArrowDown, CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { ChatComposer } from '@/components/chat/composer/chat-composer'
import { ChatMessageList, type ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'
import type { EmptyStateSuggestion } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { message } from '@/components/ui/message'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChatModelsInitialState } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatSkillMode } from '@/lib/ai/types/chat'

import { ConversationMobileSelector } from './conversation-session/conversation-mobile-selector'
import { ConversationSidebar } from './conversation-session/conversation-sidebar'
import { useConversationSessions } from './conversation-session/use-conversation-sessions'
import { HumanReviewComposerPanel } from './human-review/human-review-composer-panel'
import { ThreadMemoryStatusHint } from './thread-memory-status-hint'
import { useChatMemoryUsage } from './use-chat-memory-usage'
import { useChatModels } from './use-chat-models'
import { useChatScrollPolicy } from './use-chat-scroll-policy'
import { useChatStream } from './use-chat-stream'

const CHAT_CONTENT_COLUMN_CLASS_NAME = 'mx-auto w-full max-w-[var(--chat-content-column-width)]'

function ConversationHydrationSkeleton() {
    return (
        <section className="flex min-h-0 flex-col gap-5 py-2" role="status" aria-label="会话加载中" aria-live="polite">
            <article className="flex justify-end">
                <div className="w-fit max-w-[44rem]">
                    <Skeleton className="h-12 w-[18rem] max-w-[72vw] rounded-2xl bg-sky-50/55 shadow-xs ring-1 ring-sky-100/70 sm:w-[22rem]" />
                </div>
            </article>

            <article className="flex justify-start">
                <div className="w-full max-w-[var(--chat-content-column-width,53.5rem)]">
                    <div className="space-y-2.5">
                        <Skeleton className="h-4 w-[62%] rounded-full bg-muted/55" />
                        <Skeleton className="h-4 w-[88%] rounded-full bg-muted/45" />
                        <Skeleton className="h-4 w-[54%] rounded-full bg-muted/45" />
                    </div>
                </div>
            </article>

            <article className="flex justify-end">
                <div className="w-fit max-w-[44rem]">
                    <Skeleton className="h-12 w-[14rem] max-w-[58vw] rounded-2xl bg-sky-50/55 shadow-xs ring-1 ring-sky-100/70 sm:w-[16rem]" />
                </div>
            </article>

            <article className="flex justify-start">
                <div className="w-full max-w-[var(--chat-content-column-width,53.5rem)]">
                    <div className="space-y-2.5">
                        <Skeleton className="h-4 w-[74%] rounded-full bg-muted/55" />
                        <Skeleton className="h-4 w-[66%] rounded-full bg-muted/45" />
                        <Skeleton className="h-4 w-[38%] rounded-full bg-muted/45" />
                    </div>
                </div>
            </article>
        </section>
    )
}

function ConversationHydrationErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 py-10 text-center">
            <Alert className="rounded-2xl border-border/70 bg-background/95 text-left">
                <CircleAlert className="size-4" />
                <AlertTitle>会话加载失败</AlertTitle>
                <AlertDescription>没有拿到这条会话的最近消息，重新加载一次通常就能恢复。</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={onRetry} className="rounded-xl px-4">
                重试加载
            </Button>
        </section>
    )
}

export default function InstantMindPage({ initialChatModelsState }: { initialChatModelsState: ChatModelsInitialState }) {
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [enableReasoning, setEnableReasoning] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [interactionLocked, setInteractionLocked] = useState(false)
    const [positionedHistoryEntrySequence, setPositionedHistoryEntrySequence] = useState<number | null>(null)
    const [heightHintBootstrapPending, setHeightHintBootstrapPending] = useState(false)
    const historyEntryStartRafRef = useRef<number | null>(null)
    const messageListRef = useRef<ChatMessageListHandle>(null)
    const [scrollViewportElement, setScrollViewportElement] = useState<HTMLDivElement | null>(null)
    const setScrollViewportRef = useCallback((node: HTMLDivElement | null) => {
        setScrollViewportElement(current => (current === node ? current : node))
    }, [])
    const {
        hasAvailableModels,
        isLoading: isModelLoading,
        model,
        modelError,
        modelGroups,
        setModel,
    } = useChatModels(initialChatModelsState)
    const {
        conversations,
        createConversation,
        deleteConversation,
        error: conversationError,
        handleConversationPromoted,
        isDraft,
        isLoading: isConversationLoading,
        isMutating: isConversationMutating,
        isReadOnlyCache: isConversationReadOnlyCache,
        readOnlyCacheMessage: conversationReadOnlyCacheMessage,
        retryRecovery: retryConversationRecovery,
        selectedConversation,
        selectedConversationId,
        presentationKey,
        selectConversation,
    } = useConversationSessions({
        interactionLocked,
    })
    const {
        messages,
        status,
        hydrationStatus,
        historyEntryReady,
        messageConversationId,
        readOnlyCacheMessage: threadReadOnlyCacheMessage,
        threadMemoryStatusHint,
        streamCompletionRevision,
        acceptedTurnRevision,
        shouldPositionAcceptedTurn,
        pendingInterrupt,
        sendMessage,
        retryHydration,
        resumeAgentRun,
        cancel,
        deleteUserTurn,
        regenerateLastTurn,
    } = useChatStream({
        conversationId: selectedConversationId ?? undefined,
        draftMode: isDraft,
        skillMode,
        model,
        enableReasoning,
        conversationMetadata: selectedConversation,
        onConversationPromoted: handleConversationPromoted,
    })
    const hasPendingReview = Boolean(pendingInterrupt)
    const chatMemoryUsage = useChatMemoryUsage({
        conversationId: selectedConversationId,
        draftMode: isDraft,
        model,
        status,
        streamCompletionRevision,
    })
    const isStreamingOutput = status === 'submitted' || status === 'streaming'
    const nextInteractionLocked = isStreamingOutput || hasPendingReview
    const conversationSidebarWidth = sidebarCollapsed ? '3.75rem' : '16.75rem'
    const conversationTransitionPending = isConversationLoading || isConversationMutating
    const selectedHistoryConversationId = isDraft ? null : selectedConversationId
    const hasCurrentMessageOwnership = selectedHistoryConversationId === null || messageConversationId === selectedHistoryConversationId
    const conversationHydrationFailed = selectedHistoryConversationId !== null && hydrationStatus === 'failed'
    const conversationHydrationPending =
        selectedHistoryConversationId !== null &&
        !conversationHydrationFailed &&
        (hydrationStatus === 'loading' || !hasCurrentMessageOwnership)
    const historyEntrySequence = historyEntryReady?.conversationId === selectedHistoryConversationId ? historyEntryReady.sequence : null
    const shouldPositionHistoryEntry =
        !conversationHydrationPending &&
        !conversationHydrationFailed &&
        !heightHintBootstrapPending &&
        hasCurrentMessageOwnership &&
        historyEntrySequence !== null &&
        historyEntrySequence !== positionedHistoryEntrySequence
    const isHistoryLayoutBootstrapping = conversationHydrationPending || heightHintBootstrapPending || shouldPositionHistoryEntry
    const isHistoryPresentationRevealed =
        !conversationHydrationPending && !conversationHydrationFailed && !heightHintBootstrapPending && !shouldPositionHistoryEntry
    const readOnlyCacheMessage = conversationReadOnlyCacheMessage ?? threadReadOnlyCacheMessage
    const isReadOnlyCache = isConversationReadOnlyCache || Boolean(threadReadOnlyCacheMessage)
    const composerDisabled = hasPendingReview
    const composerSubmitDisabled =
        conversationTransitionPending ||
        conversationHydrationPending ||
        conversationHydrationFailed ||
        heightHintBootstrapPending ||
        isReadOnlyCache
    const selectedConversationTitle = selectedConversation?.title ?? '新会话'
    const readOnlyCacheRetryDisabled = conversationTransitionPending || conversationHydrationPending || isStreamingOutput
    const readOnlyCacheDescriptionId = 'instamind-readonly-cache-description'

    const {
        composerContainerRef,
        composerOverlayInset = 0,
        onAtBottomChange,
        onItemMounted,
        onItemUnmounted,
        onRangeChange,
        onScrollingChange,
        lockFollowForReader,
        onTotalHeightChange,
        showScrollToBottom,
        restoreFollowAndScrollToEnd: restoreAutoFollowAndScrollToBottom,
        positionConversationEntryAtBottom,
    } = useChatScrollPolicy({
        isStreamingOutput,
        contentSignal: messages,
        listRef: messageListRef,
        messageCount: messages.length,
        scrollViewportElement,
        presentationKey,
        acceptedTurnRevision,
    })
    const historyEntryObservationScope = useMemo(
        () => ({ conversationId: presentationKey, sequence: historyEntrySequence ?? 0 }),
        [historyEntrySequence, presentationKey]
    )
    const handleAtBottomChange = useCallback(
        (atBottom: boolean) => onAtBottomChange(atBottom, historyEntryObservationScope),
        [historyEntryObservationScope, onAtBottomChange]
    )
    const handleRangeChange = useCallback(
        (range: { endIndex: number; startIndex: number }) => onRangeChange(range, historyEntryObservationScope),
        [historyEntryObservationScope, onRangeChange]
    )
    const handleScrollingChange = useCallback(
        (isScrolling: boolean) => onScrollingChange(isScrolling, historyEntryObservationScope),
        [historyEntryObservationScope, onScrollingChange]
    )
    const handleTotalHeightChange = useCallback(
        (height: number) => onTotalHeightChange(height, historyEntryObservationScope),
        [historyEntryObservationScope, onTotalHeightChange]
    )
    const handleMessageItemMounted = useCallback(
        (itemIndex: number) => {
            if (!historyEntryObservationScope) {
                return
            }

            onItemMounted({
                ...historyEntryObservationScope,
                itemIndex,
            })
        },
        [historyEntryObservationScope, onItemMounted]
    )
    const handleMessageItemUnmounted = useCallback(
        (itemIndex: number) => {
            if (!historyEntryObservationScope) {
                return
            }

            onItemUnmounted({
                ...historyEntryObservationScope,
                itemIndex,
            })
        },
        [historyEntryObservationScope, onItemUnmounted]
    )

    useLayoutEffect(() => {
        if (!shouldPositionHistoryEntry || historyEntrySequence === null) {
            return
        }

        historyEntryStartRafRef.current = window.requestAnimationFrame(() => {
            historyEntryStartRafRef.current = null
            positionConversationEntryAtBottom(
                {
                    conversationId: presentationKey,
                    lastMessageIndex: messages.length - 1,
                    sequence: historyEntrySequence,
                },
                () => {
                    setPositionedHistoryEntrySequence(historyEntrySequence)
                }
            )
        })

        return () => {
            if (historyEntryStartRafRef.current === null) {
                return
            }

            window.cancelAnimationFrame(historyEntryStartRafRef.current)
            historyEntryStartRafRef.current = null
        }
    }, [historyEntrySequence, messages.length, positionConversationEntryAtBottom, presentationKey, shouldPositionHistoryEntry])

    useEffect(() => {
        setInteractionLocked(nextInteractionLocked)
    }, [nextInteractionLocked])

    async function handleSubmit(value: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        if (hasPendingReview || isReadOnlyCache) {
            return false
        }

        // sendMessage 内部会立即写入用户消息并切到 submitted，这里返回 true 让 Composer 直接清空草稿。
        void sendMessage(value, composer, displaySegments)
        return true
    }

    function handleSelectSuggestion(suggestion: EmptyStateSuggestion) {
        if (status === 'submitted' || status === 'streaming' || hasPendingReview || isReadOnlyCache) {
            return
        }

        void handleSubmit(suggestion.text, suggestion.composer, suggestion.displaySegments)
    }

    function handleSelectFollowUpQuestion(question: string) {
        if (status === 'submitted' || status === 'streaming' || hasPendingReview || isReadOnlyCache) {
            return
        }

        void handleSubmit(question)
    }

    async function handleRegenerateLastTurn() {
        return regenerateLastTurn()
    }

    async function handleResumeDecision(decision: Parameters<typeof resumeAgentRun>[0]) {
        try {
            return await resumeAgentRun(decision)
        } catch {
            return false
        }
    }

    function handleCreateConversation() {
        if (nextInteractionLocked || isReadOnlyCache) {
            return false
        }

        return createConversation()
    }

    function handleSelectConversation(conversationId: string) {
        if (nextInteractionLocked) {
            return false
        }

        return selectConversation(conversationId)
    }

    function handleDeleteConversation(conversationId: string) {
        if (nextInteractionLocked || isReadOnlyCache) {
            return false
        }

        return deleteConversation(conversationId)
    }

    function handleRetryReadOnlyCache() {
        const registryRetryAccepted = retryConversationRecovery()
        const hydrationRetryAccepted = retryHydration()

        return registryRetryAccepted || hydrationRetryAccepted
    }

    const handleProjectLinkCopied = useCallback(() => {
        message.add({
            id: 'project-link-copy',
            type: 'success',
            title: '已复制链接，请在浏览器打开',
        })
    }, [])

    const handleProjectLinkCopyFailed = useCallback(() => {
        message.add({
            id: 'project-link-copy',
            type: 'error',
            title: '复制链接失败，请手动复制',
            priority: 'high',
        })
    }, [])

    const conversationSelectionDisabled = nextInteractionLocked || isConversationLoading || isConversationMutating
    const conversationWriteDisabled = conversationSelectionDisabled || isReadOnlyCache

    const conversationNotice = conversationError ? (
        <Alert variant="destructive" className="rounded-xl border-destructive/20 bg-destructive/5 p-3">
            <CircleAlert />
            <AlertTitle>会话服务暂时不可用</AlertTitle>
            <AlertDescription>{conversationError}</AlertDescription>
            <div className="col-start-2 mt-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retryConversationRecovery}
                    disabled={conversationTransitionPending || nextInteractionLocked}
                >
                    重试加载会话
                </Button>
            </div>
        </Alert>
    ) : null

    return (
        <main
            className="h-dvh overflow-hidden bg-background text-foreground"
            data-slot="instant-mind-page"
            style={{
                ['--chat-content-column-width' as string]: '53.5rem',
                ['--conversation-sidebar-width' as string]: conversationSidebarWidth,
            }}
        >
            <ConversationSidebar
                collapsed={sidebarCollapsed}
                conversations={conversations}
                createDisabled={conversationWriteDisabled}
                deleteDisabled={conversationWriteDisabled}
                disabled={conversationSelectionDisabled}
                onCreateConversation={() => {
                    void handleCreateConversation()
                }}
                onDeleteConversation={handleDeleteConversation}
                notice={conversationNotice}
                onProjectLinkCopied={handleProjectLinkCopied}
                onProjectLinkCopyFailed={handleProjectLinkCopyFailed}
                onSelectConversation={handleSelectConversation}
                onToggleCollapsed={() => setSidebarCollapsed(current => !current)}
            />

            <div
                className="relative flex h-full min-w-0 flex-col transition-[padding-left] duration-200 ease-linear lg:pl-[var(--conversation-sidebar-width)]"
                data-slot="chat-layout"
            >
                <ConversationMobileSelector
                    conversations={conversations}
                    createDisabled={conversationWriteDisabled}
                    deleteDisabled={conversationWriteDisabled}
                    disabled={conversationSelectionDisabled}
                    notice={conversationNotice}
                    onCreateConversation={handleCreateConversation}
                    onDeleteConversation={handleDeleteConversation}
                    onProjectLinkCopied={handleProjectLinkCopied}
                    onProjectLinkCopyFailed={handleProjectLinkCopyFailed}
                    onSelectConversation={handleSelectConversation}
                    selectedConversationTitle={selectedConversationTitle}
                />
                <div className="relative min-h-0 flex-1">
                    <div
                        ref={setScrollViewportRef}
                        role="region"
                        tabIndex={0}
                        aria-label="聊天记录"
                        className={[
                            'h-full overscroll-contain',
                            isHistoryLayoutBootstrapping ? 'overflow-y-hidden' : 'overflow-y-auto',
                        ].join(' ')}
                        data-slot="chat-message-viewport"
                        style={{ scrollbarGutter: 'stable both-edges', overflowAnchor: 'none' }}
                    >
                        <div className="px-4 pt-0 sm:px-6 lg:px-8 lg:pt-8" data-slot="chat-message-content">
                            <div className={CHAT_CONTENT_COLUMN_CLASS_NAME + ' relative'} data-slot="chat-main-column">
                                {conversationHydrationFailed ? (
                                    <ConversationHydrationErrorState
                                        onRetry={() => {
                                            retryHydration()
                                        }}
                                    />
                                ) : null}
                                {!conversationHydrationPending && !conversationHydrationFailed ? (
                                    <div
                                        className={!isHistoryPresentationRevealed ? 'invisible' : undefined}
                                        data-entry-positioned={String(isHistoryPresentationRevealed)}
                                        data-slot="conversation-history-presentation"
                                    >
                                        {scrollViewportElement ? (
                                            <ChatMessageList
                                                key={presentationKey}
                                                presentationKey={presentationKey}
                                                ref={messageListRef}
                                                bottomInset={composerOverlayInset + 54}
                                                conversationId={selectedConversationId ?? undefined}
                                                messages={messages}
                                                positionAcceptedTurn={shouldPositionAcceptedTurn}
                                                scrollParent={scrollViewportElement}
                                                status={status}
                                                enableReasoning={enableReasoning}
                                                showEmptyStateSuggestions={isDraft}
                                                actionsDisabled={hasPendingReview || conversationTransitionPending || isReadOnlyCache}
                                                onAtBottomChange={handleAtBottomChange}
                                                onDeleteUserTurn={deleteUserTurn}
                                                onHeightHintBootstrapChange={setHeightHintBootstrapPending}
                                                onItemMounted={handleMessageItemMounted}
                                                onItemUnmounted={handleMessageItemUnmounted}
                                                onRangeChange={handleRangeChange}
                                                onRegenerateLastTurn={handleRegenerateLastTurn}
                                                onScrollingChange={handleScrollingChange}
                                                onSelectFollowUpQuestion={handleSelectFollowUpQuestion}
                                                onSelectSuggestion={handleSelectSuggestion}
                                                onUserReading={lockFollowForReader}
                                                onTotalHeightChange={handleTotalHeightChange}
                                            />
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    {isHistoryLayoutBootstrapping ? (
                        <div
                            className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-0 sm:px-6 lg:px-8 lg:pt-8"
                            data-slot="conversation-entry-layout-skeleton"
                        >
                            <div className={`${CHAT_CONTENT_COLUMN_CLASS_NAME} relative`}>
                                <ConversationHydrationSkeleton />
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <div
                className="pointer-events-none fixed right-0 bottom-0 left-0 z-20 overflow-visible pt-12 pb-4 transition-[left] duration-200 ease-linear lg:left-[var(--conversation-sidebar-width)]"
                data-slot="chat-composer-shell"
            >
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[calc(var(--chat-content-column-width)+4rem)] -translate-x-1/2 bg-gradient-to-t from-background via-background/95 to-transparent"
                    data-slot="chat-composer-gradient-mask"
                />
                <div className="pointer-events-none relative z-10 px-4 sm:px-6 lg:px-8">
                    <div className={`${CHAT_CONTENT_COLUMN_CLASS_NAME} pointer-events-auto relative`} data-slot="chat-composer-column">
                        {isHistoryPresentationRevealed ? (
                            <div
                                className={[
                                    'pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out',
                                    showScrollToBottom ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                                ].join(' ')}
                            >
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-lg"
                                    aria-label="回到底部"
                                    aria-hidden={!showScrollToBottom}
                                    disabled={!showScrollToBottom}
                                    onClick={restoreAutoFollowAndScrollToBottom}
                                    className="pointer-events-auto rounded-full border-border/70 bg-background/95 shadow-md shadow-black/5 hover:bg-muted/60"
                                >
                                    <ArrowDown className="size-4" strokeWidth={2.4} />
                                </Button>
                            </div>
                        ) : null}

                        <div ref={composerContainerRef}>
                            {readOnlyCacheMessage ? (
                                <Alert
                                    className="mb-3 rounded-xl border-border/70 bg-background/95"
                                    aria-describedby={readOnlyCacheDescriptionId}
                                >
                                    <CircleAlert />
                                    <AlertTitle>本地只读缓存</AlertTitle>
                                    <AlertDescription id={readOnlyCacheDescriptionId}>{readOnlyCacheMessage}</AlertDescription>
                                    <div className="col-start-2 mt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleRetryReadOnlyCache}
                                            disabled={readOnlyCacheRetryDisabled}
                                            aria-describedby={readOnlyCacheDescriptionId}
                                        >
                                            重试连接服务端
                                        </Button>
                                    </div>
                                </Alert>
                            ) : null}
                            <ThreadMemoryStatusHint hint={threadMemoryStatusHint} />
                            <HumanReviewComposerPanel pendingInterrupt={pendingInterrupt} onResumeDecision={handleResumeDecision} />
                            <ChatComposer
                                contextUsage={chatMemoryUsage}
                                disabled={composerDisabled}
                                placeholder={hasPendingReview ? '请先处理上方人工审核，普通输入已锁定。' : undefined}
                                status={status}
                                skillMode={skillMode}
                                model={model}
                                hasAvailableModels={hasAvailableModels}
                                isModelLoading={isModelLoading}
                                modelError={modelError}
                                modelGroups={modelGroups}
                                enableReasoning={enableReasoning}
                                onSkillModeChange={setSkillMode}
                                onModelChange={setModel}
                                onEnableReasoningChange={setEnableReasoning}
                                onSubmit={handleSubmit}
                                onStop={cancel}
                                submitDisabled={composerSubmitDisabled}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
