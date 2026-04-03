'use client'

import {
    Calculator,
    CalendarClock,
    ChevronRight,
    CircleAlert,
    CircleCheckBig,
    CloudSun,
    FileText,
    LoaderCircle,
    Ruler,
    Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import type { MindMessage, MindMessagePart, ReasoningPart, ToolPart } from '@/lib/ai/types/message'

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

function getToolIcon(toolName: string) {
    switch (toolName) {
        case 'calculator':
            return Calculator
        case 'city-weather':
            return CloudSun
        case 'datetime':
            return CalendarClock
        case 'local-text-read':
        case 'text-transform':
            return FileText
        case 'unit-convert':
            return Ruler
        default:
            return Wrench
    }
}

function getToolTitle(part: ToolPart) {
    return part.title ?? part.toolName
}

function getActionLabel(action?: string) {
    if (!action) {
        return null
    }

    const labelMap: Record<string, string> = {
        evaluate: '计算',
        current: '实时天气',
        now: '当前时间',
        add: '日期偏移',
        weekday: '星期判断',
        read: '读取文件',
        convert: '单位换算',
        'markdown-to-text': 'Markdown 转纯文本',
        'extract-links': '提取链接',
        'extract-code-blocks': '提取代码块',
        'json-pretty': 'JSON 格式化',
    }

    return labelMap[action] ?? action
}

function getStatusLabel(status: ToolPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '执行中'
    }
}

function renderStatusIcon(status: ToolPart['status']) {
    switch (status) {
        case 'completed':
            return <CircleCheckBig className="size-3.5" strokeWidth={2.2} />
        case 'failed':
            return <CircleAlert className="size-3.5" strokeWidth={2.2} />
        default:
            return <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
    }
}

function getStatusVariant(status: ToolPart['status']): 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'completed':
            return 'secondary'
        case 'failed':
            return 'destructive'
        default:
            return 'outline'
    }
}

function getStatusClassName(status: ToolPart['status']) {
    switch (status) {
        case 'completed':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700'
        case 'failed':
            return 'border-rose-200 bg-rose-50 text-rose-700'
        default:
            return 'border-sky-200 bg-sky-50 text-sky-700'
    }
}

function ReasoningPanel({ combinedReasoning }: { combinedReasoning: string }) {
    const [open, setOpen] = useState(false)

    if (!combinedReasoning) {
        return null
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <Card size="sm" className="mb-3 border-border/60 py-0 shadow-xs">
                <CardContent className="px-4">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground outline-none">
                        <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} strokeWidth={2.2} />
                        <span>推理过程</span>
                    </CollapsibleTrigger>
                    {open ? (
                        <CollapsibleContent forceMount className="overflow-hidden">
                            <pre className="mt-1.5 whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">
                                {combinedReasoning}
                            </pre>
                        </CollapsibleContent>
                    ) : null}
                </CardContent>
            </Card>
        </Collapsible>
    )
}

function ToolPanel({ part }: { part: ToolPart }) {
    const Icon = getToolIcon(part.toolName)
    const actionLabel = getActionLabel(part.action)

    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <Icon className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>工具调用：{getToolTitle(part)}</span>
                    </CardTitle>

                    <div className="flex flex-wrap items-center gap-2">
                        {actionLabel ? <Badge variant="outline">{actionLabel}</Badge> : null}
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-2.5 pt-4">
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                    <div className="text-[0.7rem] font-medium text-muted-foreground">输入</div>
                    <Separator className="my-2" />
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{part.input}</pre>
                </div>

                {part.output ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">结果</div>
                        <Separator className="my-2" />
                        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{part.output}</pre>
                    </div>
                ) : null}

                {part.error ? (
                    <Alert variant="destructive">
                        <CircleAlert className="size-4" strokeWidth={2.2} />
                        <AlertTitle>错误</AlertTitle>
                        <AlertDescription>
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{part.error}</pre>
                        </AlertDescription>
                    </Alert>
                ) : null}
            </CardContent>
        </Card>
    )
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
        <div ref={containerRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 py-2">
            {messages.length === 0 ? (
                <Card size="sm" className="border-dashed border-border/70 bg-card/80 shadow-none">
                    <CardContent className="px-4 py-12 text-center text-sm leading-7 text-muted-foreground">
                        发送第一条消息后，这里会展示多轮上下文下的回答、推理过程和工具调用结果。
                    </CardContent>
                </Card>
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
                                <div className="inline-flex items-center gap-2.5 py-2 text-sm text-muted-foreground">
                                    <LoaderCircle className="size-4 animate-spin" strokeWidth={2.2} />
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
                            <div className="w-fit max-w-[44rem] rounded-2xl bg-primary/10 px-3.5 py-2.5 text-foreground shadow-xs">
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
                        <div className="w-full max-w-[51rem] text-foreground">
                            <ReasoningPanel combinedReasoning={combinedReasoning} />

                            {contentParts.map((part, index) => {
                                if (part.type === 'text') {
                                    return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'tool') {
                                    return <ToolPanel key={`${message.id}:tool:${part.id ?? index}`} part={part} />
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
