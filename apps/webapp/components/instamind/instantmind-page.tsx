'use client'

import { ArrowDown, CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { ChatComposer } from '@/components/chat/composer/chat-composer'
import { ChatMessageList, type ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'
import type { EmptyStateSuggestion } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChatModelsInitialState } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatSkillMode } from '@/lib/ai/types/chat'

import { ConversationMobileSelector } from './conversation-session/conversation-mobile-selector'
import { ConversationSidebar } from './conversation-session/conversation-sidebar'
import { useConversationSessions } from './conversation-session/use-conversation-sessions'
import { HumanReviewComposerPanel } from './human-review/human-review-composer-panel'
import { ProjectLinkNotice, type ProjectLinkNoticeType } from './project-link-notice'
import { ThreadMemoryStatusHint } from './thread-memory-status-hint'
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
    const [projectLinkNotice, setProjectLinkNotice] = useState<{ id: number; type: ProjectLinkNoticeType } | null>(null)
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
        selectConversation,
    } = useConversationSessions({
        interactionLocked,
    })
    const {
        messages,
        status,
        imageQuotaError,
        hydrationStatus,
        historyEntryReady,
        messageConversationId,
        readOnlyCacheMessage: threadReadOnlyCacheMessage,
        threadMemoryStatusHint,
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
        onTotalHeightChange,
        showScrollToBottom,
        resetScrollPolicyForNewTurn: resetAutoScrollForNewTurn,
        restoreFollowAndScrollToEnd: restoreAutoFollowAndScrollToBottom,
        positionConversationEntryAtBottom,
        cancelConversationEntryPositioning,
    } = useChatScrollPolicy({
        isStreamingOutput,
        contentSignal: messages,
        listRef: messageListRef,
        messageCount: messages.length,
        scrollViewportElement,
    })
    const historyEntryObservationScope = useMemo(
        () =>
            selectedHistoryConversationId !== null && historyEntrySequence !== null
                ? { conversationId: selectedHistoryConversationId, sequence: historyEntrySequence }
                : undefined,
        [historyEntrySequence, selectedHistoryConversationId]
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
        cancelConversationEntryPositioning()
    }, [cancelConversationEntryPositioning, selectedHistoryConversationId])

    useLayoutEffect(() => {
        if (!shouldPositionHistoryEntry || historyEntrySequence === null) {
            return
        }

        historyEntryStartRafRef.current = window.requestAnimationFrame(() => {
            historyEntryStartRafRef.current = null
            positionConversationEntryAtBottom(
                {
                    conversationId: selectedHistoryConversationId ?? '',
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
    }, [
        historyEntrySequence,
        messages.length,
        positionConversationEntryAtBottom,
        selectedHistoryConversationId,
        shouldPositionHistoryEntry,
    ])

    useEffect(() => {
        setInteractionLocked(nextInteractionLocked)
    }, [nextInteractionLocked])

    async function handleSubmit(value: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        if (hasPendingReview || isReadOnlyCache) {
            return false
        }

        resetAutoScrollForNewTurn()

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
        resetAutoScrollForNewTurn()

        return regenerateLastTurn()
    }

    async function handleResumeDecision(decision: Parameters<typeof resumeAgentRun>[0]) {
        resetAutoScrollForNewTurn()

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

    const dismissProjectLinkNotice = useCallback(() => {
        setProjectLinkNotice(null)
    }, [])

    function showProjectLinkNotice(type: ProjectLinkNoticeType) {
        setProjectLinkNotice(current => ({
            id: (current?.id ?? 0) + 1,
            type,
        }))
    }

    const conversationSelectionDisabled = nextInteractionLocked || isConversationLoading || isConversationMutating
    const conversationWriteDisabled = conversationSelectionDisabled || isReadOnlyCache

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
                onProjectLinkCopied={() => showProjectLinkNotice('copied')}
                onProjectLinkCopyFailed={() => showProjectLinkNotice('copy-failed')}
                onSelectConversation={handleSelectConversation}
                onToggleCollapsed={() => setSidebarCollapsed(current => !current)}
            />

            <div
                className="relative h-full min-w-0 transition-[padding-left] duration-200 ease-linear lg:pl-[var(--conversation-sidebar-width)]"
                data-slot="chat-layout"
            >
                <div
                    ref={setScrollViewportRef}
                    role="region"
                    tabIndex={0}
                    aria-label="聊天记录"
                    className={['h-full overscroll-contain', isHistoryLayoutBootstrapping ? 'overflow-y-hidden' : 'overflow-y-auto'].join(
                        ' '
                    )}
                    data-slot="chat-message-viewport"
                    style={{ scrollbarGutter: 'stable both-edges' }}
                >
                    <div className="px-4 pt-0 sm:px-6 lg:px-8 lg:pt-8" data-slot="chat-message-content">
                        <ConversationMobileSelector
                            conversations={conversations}
                            createDisabled={conversationWriteDisabled}
                            deleteDisabled={conversationWriteDisabled}
                            disabled={conversationSelectionDisabled}
                            onCreateConversation={handleCreateConversation}
                            onDeleteConversation={handleDeleteConversation}
                            onProjectLinkCopied={() => showProjectLinkNotice('copied')}
                            onProjectLinkCopyFailed={() => showProjectLinkNotice('copy-failed')}
                            onSelectConversation={handleSelectConversation}
                            selectedConversationTitle={selectedConversationTitle}
                        />
                        <div className={`${CHAT_CONTENT_COLUMN_CLASS_NAME} relative`} data-slot="chat-main-column">
                            {projectLinkNotice ? (
                                <ProjectLinkNotice
                                    key={projectLinkNotice.id}
                                    notice={projectLinkNotice.type}
                                    onDismiss={dismissProjectLinkNotice}
                                />
                            ) : null}
                            {imageQuotaError ? (
                                <Alert variant="destructive" className="mb-4 rounded-2xl">
                                    <CircleAlert />
                                    <AlertTitle>今日生图次数已达上限</AlertTitle>
                                    <AlertDescription>{imageQuotaError}</AlertDescription>
                                </Alert>
                            ) : null}
                            {conversationError ? (
                                <Alert variant="destructive" className="mb-4 rounded-2xl border-destructive/20 bg-destructive/5">
                                    <CircleAlert className="size-4" />
                                    <AlertTitle>会话列表暂时不可用</AlertTitle>
                                    <AlertDescription>{conversationError}</AlertDescription>
                                </Alert>
                            ) : null}
                            {readOnlyCacheMessage ? (
                                <Alert
                                    className="mb-4 rounded-2xl border-amber-200/80 bg-amber-50/80 text-amber-950"
                                    aria-describedby={readOnlyCacheDescriptionId}
                                >
                                    <CircleAlert className="size-4" />
                                    <AlertTitle>本地只读缓存</AlertTitle>
                                    <AlertDescription id={readOnlyCacheDescriptionId}>
                                        {readOnlyCacheMessage}
                                        <p className="mt-3">要恢复发送、新建或删除会话，请重试连接服务端。</p>
                                    </AlertDescription>
                                    <div className="col-start-2 mt-3 flex flex-wrap gap-2">
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
                                            key={selectedConversationId ?? 'draft'}
                                            ref={messageListRef}
                                            bottomInset={composerOverlayInset + 54}
                                            conversationId={selectedConversationId ?? undefined}
                                            messages={messages}
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
                        className="pointer-events-none absolute top-0 right-0 left-0 z-10 px-4 pt-0 sm:px-6 lg:left-[var(--conversation-sidebar-width)] lg:px-8 lg:pt-8"
                        data-slot="conversation-entry-layout-skeleton"
                    >
                        <div className={`${CHAT_CONTENT_COLUMN_CLASS_NAME} relative`}>
                            <ConversationHydrationSkeleton />
                        </div>
                    </div>
                ) : null}
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
                            <ThreadMemoryStatusHint hint={threadMemoryStatusHint} />
                            <HumanReviewComposerPanel pendingInterrupt={pendingInterrupt} onResumeDecision={handleResumeDecision} />
                            <ChatComposer
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
