'use client'

import { useEffect, useRef } from 'react'

import type { MindMessage } from '../../lib/ai/types/message'
import { TextPartView } from './text-part'

export function ChatMessageList({ messages, status }: { messages: MindMessage[]; status: 'ready' | 'submitted' | 'streaming' | 'error' }) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current) {
            return
        }

        containerRef.current.scrollTop = containerRef.current.scrollHeight
    }, [messages])

    return (
        <div
            ref={containerRef}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                flex: '1 1 auto',
                minHeight: 0,
                overflowY: 'auto',
                padding: '6px 0 16px',
            }}
        >
            {messages.length === 0 ? (
                <div
                    style={{
                        color: '#64748b',
                        fontSize: '14px',
                        textAlign: 'center',
                        padding: '56px 16px',
                        border: '1px dashed #d7dee8',
                        borderRadius: '20px',
                        background: '#ffffff',
                    }}
                >
                    发送第一个问题后，前端会维护当前会话消息，并在下一次请求时一并发送给 LangChain。
                </div>
            ) : null}

            {messages.map(message => {
                const hasVisibleContent = message.parts.some(part => part.type !== 'text' || part.text.trim().length > 0)

                if (!hasVisibleContent) {
                    if (message.role === 'assistant' && (status === 'submitted' || status === 'streaming')) {
                        return (
                            <article
                                key={message.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'flex-start',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 0',
                                        color: '#64748b',
                                        fontSize: '14px',
                                    }}
                                >
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            gap: '6px',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '7px',
                                                height: '7px',
                                                borderRadius: '999px',
                                                background: '#94a3b8',
                                                opacity: 0.45,
                                            }}
                                        />
                                        <span
                                            style={{
                                                width: '7px',
                                                height: '7px',
                                                borderRadius: '999px',
                                                background: '#94a3b8',
                                                opacity: 0.7,
                                            }}
                                        />
                                        <span
                                            style={{
                                                width: '7px',
                                                height: '7px',
                                                borderRadius: '999px',
                                                background: '#94a3b8',
                                                opacity: 0.95,
                                            }}
                                        />
                                    </span>
                                    <span>正在思考...</span>
                                </div>
                            </article>
                        )
                    }

                    return null
                }

                if (message.role === 'user') {
                    return (
                        <article
                            key={message.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <div
                                style={{
                                    width: 'fit-content',
                                    maxWidth: 'min(100%, 708px)',
                                    borderRadius: '20px',
                                    padding: '10px 14px',
                                    background: '#dbe7f5',
                                    color: '#0f172a',
                                }}
                            >
                                {message.parts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <TextPartView key={`${message.id}:text:${index}`} part={part} />
                                    }

                                    return null
                                })}
                            </div>
                        </article>
                    )
                }

                return (
                    <article
                        key={message.id}
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-start',
                        }}
                    >
                        <div
                            style={{
                                width: 'min(100%, 820px)',
                                color: '#0f172a',
                            }}
                        >
                            {message.parts.map((part, index) => {
                                if (part.type === 'text') {
                                    return <TextPartView key={`${message.id}:text:${index}`} part={part} />
                                }

                                return (
                                    <details
                                        key={`${message.id}:reasoning:${index}`}
                                        style={{
                                            marginBottom: '12px',
                                            padding: '10px 12px',
                                            borderRadius: '14px',
                                            border: '1px solid #e2e8f0',
                                            background: '#ffffff',
                                            color: '#475569',
                                        }}
                                    >
                                        <summary style={{ cursor: 'pointer', fontSize: '13px' }}>Reasoning</summary>
                                        <pre
                                            style={{
                                                margin: '10px 0 0',
                                                whiteSpace: 'pre-wrap',
                                                fontFamily: 'inherit',
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            {part.text}
                                        </pre>
                                    </details>
                                )
                            })}
                        </div>
                    </article>
                )
            })}
        </div>
    )
}
