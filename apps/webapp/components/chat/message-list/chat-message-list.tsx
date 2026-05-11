'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { MindMessage, ReasoningPart } from '@/lib/ai/types/message'

import { AssistantMessage } from './assistant-message'
import type { EmptyStateSuggestion } from './empty-state-suggestion-options'
import { EmptyStateSuggestions } from './empty-state-suggestions'
import {
    type AssistantFeedback,
    buildCombinedReasoning,
    type ChatListStatus,
    copyTextToClipboard,
    getMessageCopyText,
    getMessageTextContent,
    hasVisibleContent,
} from './message-list-utils'
import { ThinkingText } from './thinking-text'
import { UserMessage } from './user-message'

const ChatMessageItem = memo(function ChatMessageItem({
    feedbackState,
    isCopied,
    message,
    messageIndex,
    onCopy,
    onDeleteUserTurn,
    onFeedbackChange,
    onRegenerateLastTurn,
    status,
    totalMessages,
    enableReasoning,
}: {
    enableReasoning: boolean
    feedbackState: AssistantFeedback
    isCopied: boolean
    message: MindMessage
    messageIndex: number
    onCopy: (message: MindMessage) => void
    onDeleteUserTurn: (userMessageId: string) => boolean
    onFeedbackChange: (messageId: string, feedback: 'up' | 'down') => void
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    status: ChatListStatus
    totalMessages: number
}) {
    const visibleParts = useMemo(() => message.parts.filter(hasVisibleContent), [message.parts])
    const reasoningParts = useMemo(() => visibleParts.filter((part): part is ReasoningPart => part.type === 'reasoning'), [visibleParts])
    const contentParts = useMemo(() => visibleParts.filter(part => part.type !== 'reasoning'), [visibleParts])
    const combinedReasoning = useMemo(() => buildCombinedReasoning(reasoningParts), [reasoningParts])
    const messageTextContent = useMemo(() => getMessageTextContent(message), [message])
    const hasTextContent = messageTextContent.trim().length > 0
    const isLatestAssistantMessage = message.role === 'assistant' && messageIndex === totalMessages - 1
    const isAssistantReplyCompleted = !isLatestAssistantMessage || (status !== 'submitted' && status !== 'streaming')
    const isThinking = isLatestAssistantMessage && !isAssistantReplyCompleted
    // 深度思考的 chunk 可能晚于 Skill/Resource 卡片到达，先预留顶部位置，避免后续插入时把内容整体顶下去。
    const reserveReasoningSpace = enableReasoning && isThinking && combinedReasoning.length === 0

    if (message.role === 'user') {
        return (
            <UserMessage
                message={message}
                isCopied={isCopied}
                isDeleteDisabled={status === 'submitted' || status === 'streaming'}
                onCopy={onCopy}
                onDelete={onDeleteUserTurn}
            />
        )
    }

    if (visibleParts.length === 0) {
        if (message.role === 'assistant' && (status === 'submitted' || status === 'streaming')) {
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
            reserveReasoningSpace={reserveReasoningSpace}
        />
    )
})

export function ChatMessageList({
    messages,
    status,
    enableReasoning,
    onDeleteUserTurn,
    onRegenerateLastTurn,
    onSelectSuggestion,
}: {
    enableReasoning: boolean
    messages: MindMessage[]
    status: ChatListStatus
    onDeleteUserTurn: (userMessageId: string) => boolean
    onRegenerateLastTurn: () => Promise<boolean> | boolean
    onSelectSuggestion: (suggestion: EmptyStateSuggestion) => void
}) {
    const copyResetTimeoutRef = useRef<number | null>(null)
    const onDeleteUserTurnRef = useRef(onDeleteUserTurn)
    const onRegenerateLastTurnRef = useRef(onRegenerateLastTurn)
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [assistantFeedback, setAssistantFeedback] = useState<Record<string, AssistantFeedback>>({})

    useEffect(() => {
        onDeleteUserTurnRef.current = onDeleteUserTurn
        onRegenerateLastTurnRef.current = onRegenerateLastTurn
    }, [onDeleteUserTurn, onRegenerateLastTurn])

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

    return (
        <div className="flex min-h-0 flex-col gap-5 px-1 py-2">
            {messages.length === 0 ? (
                <EmptyStateSuggestions
                    disabled={status === 'submitted' || status === 'streaming'}
                    onSelectSuggestion={onSelectSuggestion}
                />
            ) : null}

            {messages.map((message, messageIndex) => {
                const isCopied = copiedMessageId === message.id
                const feedbackState = assistantFeedback[message.id] ?? null

                return (
                    <ChatMessageItem
                        key={message.id}
                        enableReasoning={enableReasoning}
                        message={message}
                        messageIndex={messageIndex}
                        totalMessages={messages.length}
                        status={status}
                        isCopied={isCopied}
                        feedbackState={feedbackState}
                        onCopy={handleCopyMessage}
                        onDeleteUserTurn={handleDeleteUserTurn}
                        onFeedbackChange={toggleAssistantFeedback}
                        onRegenerateLastTurn={handleRegenerateLastTurn}
                    />
                )
            })}
        </div>
    )
}
