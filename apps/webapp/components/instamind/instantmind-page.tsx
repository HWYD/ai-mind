'use client'

import { ArrowDown, CircleAlert } from 'lucide-react'
import { useState } from 'react'

import { ChatComposer } from '@/components/chat/composer/chat-composer'
import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
import type { EmptyStateSuggestion } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatSkillMode } from '@/lib/ai/types/chat'

import { useChatAutoScroll } from './use-chat-auto-scroll'
import { useChatStream } from './use-chat-stream'

export default function InstantMindPage() {
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [model, setModel] = useState<ChatModel>(defaultChatModel)
    const [enableReasoning, setEnableReasoning] = useState(true)
    const { messages, status, error, sendMessage, cancel, deleteUserTurn, regenerateLastTurn } = useChatStream({
        skillMode,
        model,
        enableReasoning,
    })
    const isStreamingOutput = status === 'submitted' || status === 'streaming'
    const { inputContainerRef, bottomSpacing, showScrollToBottom, resetAutoScrollForNewTurn, restoreAutoFollowAndScrollToBottom } =
        useChatAutoScroll({
            isStreamingOutput,
            contentSignal: messages,
        })

    async function handleSubmit(value: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        resetAutoScrollForNewTurn()

        // sendMessage 内部会立即写入用户消息并切到 submitted；这里返回 true 代表 Composer 可以立刻清空草稿，
        // 不需要等完整流式回答结束后才清空输入框。
        void sendMessage(value, composer, displaySegments)
        return true
    }

    function handleSelectSuggestion(suggestion: EmptyStateSuggestion) {
        if (status === 'submitted' || status === 'streaming') {
            return
        }

        void handleSubmit(suggestion.text, suggestion.composer, suggestion.displaySegments)
    }

    function handleSelectFollowUpQuestion(question: string) {
        if (status === 'submitted' || status === 'streaming') {
            return
        }

        void handleSubmit(question)
    }

    async function handleRegenerateLastTurn() {
        resetAutoScrollForNewTurn()

        return regenerateLastTurn()
    }

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-6 pt-9" style={{ paddingBottom: `${bottomSpacing}px` }}>
                <header>
                    <h1 className="m-0 text-4xl font-semibold tracking-tight">AI Mind</h1>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                        AI Runtime 实验台：支持普通问答、深度思考、Tool 调用与多来源上下文读取。
                    </p>
                </header>

                {error ? (
                    <Alert variant="destructive">
                        <CircleAlert className="size-4" strokeWidth={2.2} />
                        <AlertTitle>请求错误</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <ChatMessageList
                    messages={messages}
                    status={status}
                    enableReasoning={enableReasoning}
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
                        <ChatComposer
                            status={status}
                            skillMode={skillMode}
                            model={model}
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
