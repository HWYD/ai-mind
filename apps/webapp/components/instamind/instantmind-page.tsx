'use client'

import { ArrowDown } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { ChatComposer } from '@/components/chat/composer/chat-composer'
import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
import type { EmptyStateSuggestion } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { Button } from '@/components/ui/button'
import type { ChatModelsInitialState } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatSkillMode } from '@/lib/ai/types/chat'

import { HumanReviewComposerPanel } from './human-review/human-review-composer-panel'
import { ThreadMemoryStatusHint } from './thread-memory-status-hint'
import { useChatAutoScroll } from './use-chat-auto-scroll'
import { useChatModels } from './use-chat-models'
import { useChatStream } from './use-chat-stream'

export default function InstantMindPage({ initialChatModelsState }: { initialChatModelsState: ChatModelsInitialState }) {
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [enableReasoning, setEnableReasoning] = useState(false)
    const {
        hasAvailableModels,
        isLoading: isModelLoading,
        model,
        modelError,
        modelGroups,
        setModel,
    } = useChatModels(initialChatModelsState)
    const {
        messages,
        status,
        threadMemoryStatusHint,
        pendingInterrupt,
        sendMessage,
        resumeAgentRun,
        cancel,
        deleteUserTurn,
        regenerateLastTurn,
    } = useChatStream({
        skillMode,
        model,
        enableReasoning,
    })
    const hasPendingReview = Boolean(pendingInterrupt)
    const isStreamingOutput = status === 'submitted' || status === 'streaming'
    const { inputContainerRef, bottomSpacing, showScrollToBottom, resetAutoScrollForNewTurn, restoreAutoFollowAndScrollToBottom } =
        useChatAutoScroll({
            isStreamingOutput,
            contentSignal: messages,
        })

    async function handleSubmit(value: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        if (hasPendingReview) {
            return false
        }

        resetAutoScrollForNewTurn()

        // sendMessage 内部会立刻写入用户消息并切到 submitted，这里返回 true 代表 Composer 可以立即清空草稿；
        // 不需要等完整流式回答结束后才清空输入框。
        void sendMessage(value, composer, displaySegments)
        return true
    }

    function handleSelectSuggestion(suggestion: EmptyStateSuggestion) {
        if (status === 'submitted' || status === 'streaming' || hasPendingReview) {
            return
        }

        void handleSubmit(suggestion.text, suggestion.composer, suggestion.displaySegments)
    }

    function handleSelectFollowUpQuestion(question: string) {
        if (status === 'submitted' || status === 'streaming' || hasPendingReview) {
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

    return (
        <main className="min-h-screen bg-background text-foreground">
            <header className="h-16 border-b bg-background">
                <div className="mx-auto flex h-full max-w-7xl items-center px-6 lg:px-12">
                    <Link href="/" className="flex items-center gap-3" aria-label="AI Mind 官网">
                        <Image src="/brand/ai-mind-icon.webp" alt="AI Mind" width={24} height={24} className="size-6 rounded-lg" priority />
                        <span className="text-xl font-semibold tracking-tight text-foreground">AI Mind</span>
                    </Link>
                </div>
            </header>

            <div
                className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col gap-5 px-6 pt-8"
                style={{ paddingBottom: `${bottomSpacing}px` }}
            >
                <ChatMessageList
                    messages={messages}
                    status={status}
                    enableReasoning={enableReasoning}
                    actionsDisabled={hasPendingReview}
                    onDeleteUserTurn={deleteUserTurn}
                    onRegenerateLastTurn={handleRegenerateLastTurn}
                    onSelectFollowUpQuestion={handleSelectFollowUpQuestion}
                    onSelectSuggestion={handleSelectSuggestion}
                />
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 overflow-visible bg-background/90 pb-4 backdrop-blur-sm">
                <div className="relative mx-auto max-w-5xl px-6">
                    <div
                        className={[
                            'pointer-events-none absolute left-1/2 bottom-full mb-3 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out',
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

                    <div ref={inputContainerRef}>
                        <ThreadMemoryStatusHint hint={threadMemoryStatusHint} />
                        <HumanReviewComposerPanel pendingInterrupt={pendingInterrupt} onResumeDecision={handleResumeDecision} />
                        <ChatComposer
                            disabled={hasPendingReview}
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
                        />
                    </div>
                </div>
            </div>
        </main>
    )
}
