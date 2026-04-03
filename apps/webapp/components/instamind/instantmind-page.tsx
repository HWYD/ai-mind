'use client'

import { CircleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { ChatInputForm } from '@/components/chat/chat-input-form'
import { ChatMessageList } from '@/components/chat/chat-message-list'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatSkillMode } from '@/lib/ai/types/chat'

import { useChatStream } from './use-chat-stream'

export default function InstantMindPage() {
    const [input, setInput] = useState('')
    const [skillMode, setSkillMode] = useState<ChatSkillMode>('auto')
    const [model, setModel] = useState<ChatModel>(defaultChatModel)
    const [enableReasoning, setEnableReasoning] = useState(true)
    const inputContainerRef = useRef<HTMLDivElement>(null)
    const [bottomSpacing, setBottomSpacing] = useState(220)
    const { messages, status, error, sendMessage, cancel } = useChatStream({
        skillMode,
        model,
        enableReasoning,
    })

    useEffect(() => {
        if (!inputContainerRef.current) {
            return
        }

        const updateSpacing = () => {
            const height = inputContainerRef.current?.offsetHeight ?? 0

            setBottomSpacing(height + 32)
        }

        updateSpacing()

        const observer = new ResizeObserver(() => {
            updateSpacing()
        })

        observer.observe(inputContainerRef.current)

        return () => observer.disconnect()
    }, [])

    async function handleSubmit() {
        const nextInput = input.trim()

        if (!nextInput) {
            return
        }

        setInput('')
        const accepted = await sendMessage(nextInput)

        if (!accepted) {
            setInput(nextInput)
        }
    }

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-6 pt-9" style={{ paddingBottom: `${bottomSpacing}px` }}>
                <header>
                    <h1 className="m-0 text-4xl font-semibold tracking-tight">InstantMind</h1>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">
                        基于 LangChain.js 与 Ollama 的最小运行时实验，支持工具调用、reader skill 和本地多轮上下文。
                    </p>
                </header>

                {error ? (
                    <Alert variant="destructive">
                        <CircleAlert className="size-4" strokeWidth={2.2} />
                        <AlertTitle>请求错误</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <ChatMessageList messages={messages} status={status} />
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 bg-background/90 pb-4 backdrop-blur-sm">
                <div ref={inputContainerRef} className="mx-auto max-w-5xl px-6">
                    <ChatInputForm
                        input={input}
                        status={status}
                        skillMode={skillMode}
                        model={model}
                        enableReasoning={enableReasoning}
                        onInputChange={setInput}
                        onSkillModeChange={setSkillMode}
                        onModelChange={setModel}
                        onEnableReasoningChange={setEnableReasoning}
                        onSubmit={handleSubmit}
                        onStop={cancel}
                    />
                </div>
            </div>
        </main>
    )
}
