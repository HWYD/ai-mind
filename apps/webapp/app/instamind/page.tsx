'use client'

import { useState } from 'react'

import { ChatInputForm } from '../../components/chat/chat-input-form'
import { ChatMessageList } from '../../components/chat/chat-message-list'
import { useChatStream } from './use-chat-stream'

export default function Page() {
    const [input, setInput] = useState('')
    const { messages, status, error, sendMessage, cancel } = useChatStream()

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
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_28%),linear-gradient(180deg,#fcfbf8_0%,#f8fafc_100%)] text-slate-900">
            <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 pb-56 pt-10">
                <header>
                    <h1 className="m-0 text-4xl font-semibold tracking-tight">InstantMind</h1>
                    <p className="mt-3 text-base leading-7 text-slate-500">
                        LangChain.js + Ollama minimal chat loop with local multi-turn context.
                    </p>
                </header>

                {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">{error}</div> : null}

                <ChatMessageList messages={messages} status={status} />
            </div>

            <div className="fixed inset-x-0 bottom-0 pb-5 z-20 bg-[#f8fafc]">
                <div className="mx-auto max-w-5xl px-6">
                    <ChatInputForm input={input} status={status} onInputChange={setInput} onSubmit={handleSubmit} onStop={cancel} />
                </div>
            </div>
        </main>
    )
}
