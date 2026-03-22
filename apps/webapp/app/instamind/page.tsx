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
        <main
            style={{
                minHeight: '100vh',
                background:
                    'radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 28%), linear-gradient(180deg, #fcfbf8 0%, #f8fafc 100%)',
                color: '#0f172a',
            }}
        >
            <div
                style={{
                    maxWidth: '960px',
                    margin: '0 auto',
                    padding: '40px 24px 28px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '22px',
                    minHeight: '100vh',
                }}
            >
                <header>
                    <h1 style={{ margin: 0, fontSize: '34px' }}>InstantMind</h1>
                    <p style={{ margin: '12px 0 0', color: '#64748b', lineHeight: 1.7 }}>
                        LangChain.js + Ollama minimal chat loop with local multi-turn context.
                    </p>
                </header>

                {error ? (
                    <div
                        style={{
                            border: '1px solid rgba(248, 113, 113, 0.24)',
                            background: '#fff1f2',
                            color: '#b91c1c',
                            borderRadius: '16px',
                            padding: '12px 14px',
                        }}
                    >
                        {error}
                    </div>
                ) : null}

                <ChatMessageList messages={messages} status={status} />

                <div
                    style={{
                        position: 'sticky',
                        bottom: 0,
                        paddingTop: '10px',
                        paddingBottom: '8px',
                        background: 'linear-gradient(180deg, rgba(252, 251, 248, 0) 0%, rgba(248, 250, 252, 0.92) 22%, #f8fafc 100%)',
                    }}
                >
                    <ChatInputForm input={input} status={status} onInputChange={setInput} onSubmit={handleSubmit} onStop={cancel} />
                </div>
            </div>
        </main>
    )
}
