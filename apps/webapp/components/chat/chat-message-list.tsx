'use client'

import { ChevronRight, CircleAlert, CircleCheckBig, LoaderCircle, Wrench } from 'lucide-react'
import { useEffect, useRef } from 'react'

import type { MindMessage, MindMessagePart, ReasoningPart } from '../../lib/ai/types/message'
import { TextPartView } from './text-part'

function hasVisibleContent(part: MindMessagePart) {
    switch (part.type) {
        case 'text':
        case 'reasoning':
            return part.text.trim().length > 0
        case 'tool':
            return true
        default:
            return false
    }
}

function buildCombinedReasoning(reasoningParts: ReasoningPart[]) {
    return reasoningParts
        .map((part, index) => {
            const text = part.text.trim()

            if (!text) {
                return ''
            }

            if (reasoningParts.length === 1) {
                return text
            }

            return `阶段 ${index + 1}\n${text}`
        })
        .filter(Boolean)
        .join('\n\n')
}

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
                    发送第一条消息后，前端会维护当前会话上下文，并在下一次请求时一并传给 LangChain。
                </div>
            ) : null}

            {messages.map(message => {
                const visibleParts = message.parts.filter(hasVisibleContent)
                const reasoningParts = visibleParts.filter((part): part is ReasoningPart => part.type === 'reasoning')
                const contentParts = visibleParts.filter(part => part.type !== 'reasoning')
                const combinedReasoning = buildCombinedReasoning(reasoningParts)

                if (visibleParts.length === 0) {
                    if (message.role === 'assistant' && (status === 'submitted' || status === 'streaming')) {
                        return (
                            <article key={message.id} className="flex justify-start">
                                <div className="inline-flex items-center gap-2.5 py-2 text-sm text-slate-500">
                                    <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.2} />
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
                            <div className="w-fit max-w-177 rounded-3xl bg-sky-100 px-3.5 py-2.5 text-slate-900 shadow-sm shadow-sky-100/70">
                                {contentParts.map((part, index) => {
                                    if (part.type === 'text') {
                                        return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                                    }

                                    return null
                                })}
                            </div>
                        </article>
                    )
                }

                return (
                    <article key={message.id} className="flex justify-start">
                        <div className="w-full max-w-205 text-slate-900">
                            {combinedReasoning ? (
                                <details className="group mb-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-slate-600 shadow-sm shadow-slate-200/40">
                                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium tracking-[0.12em] text-slate-500 [&::-webkit-details-marker]:hidden">
                                        <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" strokeWidth={2.2} />
                                        <span>推理过程</span>
                                    </summary>
                                    <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">
                                        {combinedReasoning}
                                    </pre>
                                </details>
                            ) : null}

                            {contentParts.map((part, index) => {
                                if (part.type === 'text') {
                                    return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'tool') {
                                    return (
                                        <section
                                            key={`${message.id}:tool:${part.id ?? index}`}
                                            className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm shadow-slate-200/30"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2 font-medium text-slate-900">
                                                    <Wrench className="h-4 w-4 text-slate-500" strokeWidth={2.1} />
                                                    <span>工具调用：{part.toolName}</span>
                                                </div>
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                                        part.status === 'completed'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : part.status === 'failed'
                                                              ? 'bg-rose-100 text-rose-700'
                                                              : 'bg-amber-100 text-amber-700'
                                                    }`}
                                                >
                                                    {part.status === 'completed' ? (
                                                        <CircleCheckBig className="h-3.5 w-3.5" strokeWidth={2.2} />
                                                    ) : part.status === 'failed' ? (
                                                        <CircleAlert className="h-3.5 w-3.5" strokeWidth={2.2} />
                                                    ) : (
                                                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
                                                    )}
                                                    <span>
                                                        {part.status === 'completed'
                                                            ? '已完成'
                                                            : part.status === 'failed'
                                                              ? '失败'
                                                              : '执行中'}
                                                    </span>
                                                </span>
                                            </div>

                                            <div className="mt-3 rounded-xl bg-white px-3 py-2 text-slate-600">
                                                <div className="text-xs uppercase tracking-[0.12em] text-slate-400">输入</div>
                                                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6">{part.input}</pre>
                                            </div>

                                            {part.output ? (
                                                <div className="mt-3 rounded-xl bg-white px-3 py-2 text-slate-600">
                                                    <div className="text-xs uppercase tracking-[0.12em] text-slate-400">结果</div>
                                                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6">
                                                        {part.output}
                                                    </pre>
                                                </div>
                                            ) : null}

                                            {part.error ? (
                                                <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                                                    <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-rose-400">
                                                        <CircleAlert className="h-3.5 w-3.5" strokeWidth={2.2} />
                                                        <span>错误</span>
                                                    </div>
                                                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6">{part.error}</pre>
                                                </div>
                                            ) : null}
                                        </section>
                                    )
                                }

                                return null
                            })}
                        </div>
                    </article>
                )
            })}
        </div>
    )
}
