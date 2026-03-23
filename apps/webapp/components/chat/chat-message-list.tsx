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
        <div ref={containerRef} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1 py-2">
            {messages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-14 text-center text-sm leading-7 text-slate-500">
                    发送第一个问题后，前端会维护当前会话消息，并在下一次请求时一并发给 LangChain。
                </div>
            ) : null}

            {messages.map(message => {
                const hasVisibleContent = message.parts.some(part => part.text.trim().length > 0)

                if (!hasVisibleContent) {
                    if (message.role === 'assistant' && (status === 'submitted' || status === 'streaming')) {
                        return (
                            <article key={message.id} className="flex justify-start">
                                <div className="inline-flex items-center gap-2.5 py-2 text-sm text-slate-500">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/50" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/70" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
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
                        <article key={message.id} className="flex justify-end">
                            <div className="w-fit max-w-[708px] rounded-3xl bg-sky-100 px-3.5 py-2.5 text-slate-900 shadow-sm shadow-sky-100/70">
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
                    <article key={message.id} className="flex justify-start">
                        <div className="w-full max-w-[820px] text-slate-900">
                            {message.parts.map((part, index) => {
                                if (part.type === 'text') {
                                    return <TextPartView key={`${message.id}:text:${index}`} part={part} />
                                }

                                return (
                                    <details
                                        key={`${message.id}:reasoning:${index}`}
                                        className="mb-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-slate-600 shadow-sm shadow-slate-200/40"
                                    >
                                        <summary className="cursor-pointer text-xs font-medium tracking-[0.12em] text-slate-500">
                                            推理过程
                                        </summary>
                                        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">
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
