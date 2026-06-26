'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MindMessage, ReasoningPart } from '@/lib/ai/types/message'

import { AssistantMessage } from './messages/assistant-message'
import { UserMessage } from './messages/user-message'
import {
    type AssistantFeedback,
    buildCombinedReasoning,
    type ChatListStatus,
    copyTextToClipboard,
    getMessageCopyText,
    getMessageTextContent,
    hasVisibleContent,
} from './shared/message-list-utils'
import { ThinkingText } from './shared/thinking-text'
import type { EmptyStateSuggestion } from './suggestions/empty-state-suggestion-options'
import { EmptyStateSuggestions } from './suggestions/empty-state-suggestions'

const ChatMessageItem = memo(function ChatMessageItem({
    enableReasoning,
    feedbackState,
    isAssistantReplyCompleted,
    isCopied,
    isDeleteDisabled,
    isLatestAssistantMessage,
    isThinking,
    message,
    onCopy,
    onDeleteUserTurn,
    onFeedbackChange,
    onRegenerateLastTurn,
    onSelectFollowUpQuestion,
    showFollowUpSuggestions,
}: {
    enableReasoning: boolean
    feedbackState: AssistantFeedback
    isAssistantReplyCompleted: boolean
    isCopied: boolean
    isDeleteDisabled: boolean
    isLatestAssistantMessage: boolean
    isThinking: boolean
    message: MindMessage
    onCopy: (message: MindMessage) => void
    onDeleteUserTurn: (userMessageId: string) => boolean
    onFeedbackChange: (messageId: string, feedback: 'up' | 'down') => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectFollowUpQuestion: (question: string) => void
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
                    <div className="inline-flex items-center py-2 text-sm font-medium text-muted-foreground">
                        <ThinkingText />
                    </div>
                </article>
            )
        }

        return null
    }

    return (
        <AssistantMessage
            message={message}
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
            showFollowUpSuggestions={showFollowUpSuggestions}
        />
    )
})

export function ChatMessageList({
    actionsDisabled = false,
    messages,
    status,
    enableReasoning,
    onDeleteUserTurn,
    onRegenerateLastTurn,
    onSelectFollowUpQuestion,
    onSelectSuggestion,
}: {
    actionsDisabled?: boolean
    enableReasoning: boolean
    messages: MindMessage[]
    status: ChatListStatus
    onDeleteUserTurn: (userMessageId: string) => boolean
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectFollowUpQuestion: (question: string) => void
    onSelectSuggestion: (suggestion: EmptyStateSuggestion) => void
}) {
    const copyResetTimeoutRef = useRef<number | null>(null)
    const onDeleteUserTurnRef = useRef(onDeleteUserTurn)
    const onRegenerateLastTurnRef = useRef(onRegenerateLastTurn)
    const onSelectFollowUpQuestionRef = useRef(onSelectFollowUpQuestion)
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [assistantFeedback, setAssistantFeedback] = useState<Record<string, AssistantFeedback>>({})

    useEffect(() => {
        onDeleteUserTurnRef.current = onDeleteUserTurn
        onRegenerateLastTurnRef.current = onRegenerateLastTurn
        onSelectFollowUpQuestionRef.current = onSelectFollowUpQuestion
    }, [onDeleteUserTurn, onRegenerateLastTurn, onSelectFollowUpQuestion])

    useEffect(() => {
        return () => {
            if (copyResetTimeoutRef.current) {
                window.clearTimeout(copyResetTimeoutRef.current)
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

    return (
        <div className="flex min-h-0 flex-col gap-5 px-1 py-2">
            {messages.length === 0 ? <EmptyStateSuggestions disabled={isBusy} onSelectSuggestion={onSelectSuggestion} /> : null}

            {messages.map((message, messageIndex) => {
                const isCopied = copiedMessageId === message.id
                const feedbackState = assistantFeedback[message.id] ?? null
                const isLatestAssistantMessage = message.role === 'assistant' && messageIndex === messages.length - 1
                const isAssistantReplyCompleted = !isLatestAssistantMessage || !isBusy
                const isThinking = isLatestAssistantMessage && !isAssistantReplyCompleted
                const showFollowUpSuggestions =
                    isLatestAssistantMessage &&
                    isAssistantReplyCompleted &&
                    !actionsDisabled &&
                    status === 'ready' &&
                    getMessageTextContent(message).trim().length > 0

                return (
                    <ChatMessageItem
                        key={message.id}
                        enableReasoning={enableReasoning}
                        message={message}
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
                        showFollowUpSuggestions={showFollowUpSuggestions}
                    />
                )
            })}
        </div>
    )
}
