'use client'

import {
    Calculator,
    CalendarClock,
    Check,
    ChevronRight,
    CircleAlert,
    CircleCheckBig,
    CloudSun,
    Copy,
    FileText,
    LoaderCircle,
    RotateCcw,
    Ruler,
    ThumbsDown,
    ThumbsUp,
    Trash2,
    Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import type { MindMessage, MindMessagePart, PromptPart, ReasoningPart, ResourcePart, SkillPart, ToolPart } from '@/lib/ai/types/message'

import { TextPartView } from './text-part'

function hasVisibleContent(part: MindMessagePart) {
    switch (part.type) {
        case 'text':
        case 'reasoning':
            return part.text.trim().length > 0
        case 'tool':
        case 'resource':
        case 'skill':
        case 'prompt':
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

function getToolStatusLabel(status: ToolPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '执行中'
    }
}

function getResourceStatusLabel(status: ResourcePart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '读取中'
    }
}

function getPromptStatusLabel(status: PromptPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '处理中'
    }
}

const promptInputLabelMap: Record<string, string> = {
    goal: '目标',
    theme: '主题',
    filename: '文件名',
    userGoal: '用户目标',
}

function parsePromptInputRows(input: string) {
    return input
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const separatorIndex = line.indexOf('=')

            if (separatorIndex <= 0) {
                return null
            }

            const key = line.slice(0, separatorIndex).trim()
            const value = line.slice(separatorIndex + 1).trim()

            if (!key || !value) {
                return null
            }

            return {
                key,
                label: promptInputLabelMap[key] ?? key,
                value,
            }
        })
        .filter((row): row is { key: string; label: string; value: string } => row !== null)
}

function renderStatusIcon(status: 'called' | 'completed' | 'failed' | 'loading') {
    switch (status) {
        case 'completed':
            return <CircleCheckBig className="size-3.5" strokeWidth={2.2} />
        case 'failed':
            return <CircleAlert className="size-3.5" strokeWidth={2.2} />
        default:
            return <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
    }
}

function getStatusVariant(status: 'called' | 'completed' | 'failed' | 'loading'): 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'completed':
            return 'secondary'
        case 'failed':
            return 'destructive'
        default:
            return 'outline'
    }
}

function getStatusClassName(status: 'called' | 'completed' | 'failed' | 'loading') {
    switch (status) {
        case 'completed':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700'
        case 'failed':
            return 'border-rose-200 bg-rose-50 text-rose-700'
        default:
            return 'border-sky-200 bg-sky-50 text-sky-700'
    }
}

function getSourceLabel(source?: ToolPart['source']) {
    return source === 'mcp' ? 'MCP' : '内建'
}

function getLocationLabel(location?: ToolPart['location']) {
    return location === 'remote' ? 'remote' : 'local'
}

function getMessageTextContent(message: MindMessage) {
    return message.parts
        .filter((part): part is Extract<MindMessagePart, { type: 'text' }> => part.type === 'text' && part.text.trim().length > 0)
        .map(part => part.text)
        .join('\n\n')
}

async function copyTextToClipboard(text: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
}

function getCopiedButtonClassName(active: boolean) {
    return active ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-700' : ''
}

function getFeedbackButtonClassName(active: boolean, tone: 'up' | 'down') {
    if (!active) {
        return ''
    }

    return tone === 'up'
        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700'
        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-700'
}

function ReasoningPanel({ combinedReasoning, isThinking }: { combinedReasoning: string; isThinking: boolean }) {
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
                        <span>{isThinking ? '深度思考中' : '已完成思考'}</span>
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

function SkillPanel({ part }: { part: SkillPart }) {
    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <Wrench className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>Skill 命中：{part.name}</span>
                    </CardTitle>
                    <Badge variant="outline">ID：{part.skillId}</Badge>
                </div>
            </CardHeader>
            {part.description ? (
                <CardContent className="py-0.5">
                    <p className="text-xs leading-3 text-muted-foreground">{part.description}</p>
                </CardContent>
            ) : null}
        </Card>
    )
}

function PromptPanel({ part }: { part: PromptPart }) {
    const inputRows = part.input ? parsePromptInputRows(part.input) : []

    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>Prompt 注入：{part.promptName}</span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">来源：{getSourceLabel(part.source ?? 'mcp')}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        {part.serverId ? <Badge variant="outline">服务：{part.serverId}</Badge> : null}
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getPromptStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-4">
                {part.input ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">输入</div>
                        <Separator className="my-2" />
                        {inputRows.length > 0 ? (
                            <div className="space-y-1.5 text-sm leading-6 text-foreground">
                                {inputRows.map(row => (
                                    <p key={`${row.key}:${row.value}`}>
                                        <span className="text-muted-foreground">{row.label}：</span>
                                        <span>{row.value}</span>
                                    </p>
                                ))}
                            </div>
                        ) : (
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{part.input}</pre>
                        )}
                    </div>
                ) : null}

                {typeof part.messageCount === 'number' ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">注入结果</div>
                        <Separator className="my-2" />
                        <p className="text-sm leading-6 text-foreground">已注入 {part.messageCount} 条 Prompt 上下文消息。</p>
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
                        <Badge variant="outline">来源：{getSourceLabel(part.source ?? 'mcp')}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        {part.serverId ? <Badge variant="outline">服务：{part.serverId}</Badge> : null}
                        {actionLabel ? <Badge variant="outline">{actionLabel}</Badge> : null}
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getToolStatusLabel(part.status)}</span>
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

function ResourcePanel({ part }: { part: ResourcePart }) {
    return (
        <Card size="sm" className="mb-3 border-border/60 shadow-xs">
            <CardHeader className="gap-2 border-b border-border/60 pb-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" strokeWidth={2.1} />
                        <span>资源读取：{part.resourceName}</span>
                    </CardTitle>

                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">来源：{getSourceLabel(part.source)}</Badge>
                        <Badge variant="outline">位置：{getLocationLabel(part.location)}</Badge>
                        <Badge variant="outline">服务：{part.serverId}</Badge>
                        <Badge variant={getStatusVariant(part.status)} className={getStatusClassName(part.status)}>
                            {renderStatusIcon(part.status)}
                            <span>{getResourceStatusLabel(part.status)}</span>
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-2.5 pt-4">
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                    <div className="text-[0.7rem] font-medium text-muted-foreground">URI</div>
                    <Separator className="my-2" />
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{part.uri}</pre>
                </div>

                {part.contentPreview ? (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                        <div className="text-[0.7rem] font-medium text-muted-foreground">
                            内容预览（最多显示前 {part.previewChars ?? 3000} 字）
                        </div>
                        <Separator className="my-2" />
                        <div className="max-h-24 overflow-y-auto pr-2">
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">{part.contentPreview}</pre>
                        </div>
                        {part.isTruncated ? (
                            <p className="mt-2 text-xs text-muted-foreground">已截断，仅展示前 {part.previewChars ?? 3000} 字。</p>
                        ) : null}
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

export function ChatMessageList({
    messages,
    status,
    onDeleteUserTurn,
    onRegenerateLastTurn,
}: {
    messages: MindMessage[]
    status: 'ready' | 'submitted' | 'streaming' | 'error'
    onDeleteUserTurn: (userMessageId: string) => boolean
    onRegenerateLastTurn: () => Promise<boolean> | boolean
}) {
    const copyResetTimeoutRef = useRef<number | null>(null)
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [assistantFeedback, setAssistantFeedback] = useState<Record<string, 'up' | 'down' | null>>({})

    useEffect(() => {
        return () => {
            if (copyResetTimeoutRef.current) {
                window.clearTimeout(copyResetTimeoutRef.current)
            }
        }
    }, [])

    async function handleCopy(message: MindMessage) {
        const text = getMessageTextContent(message).trim()

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
    }

    function toggleAssistantFeedback(messageId: string, nextFeedback: 'up' | 'down') {
        setAssistantFeedback(current => ({
            ...current,
            [messageId]: current[messageId] === nextFeedback ? null : nextFeedback,
        }))
    }

    return (
        <div className="flex min-h-0 flex-col gap-5 px-1 py-2">
            {messages.length === 0 ? (
                <Card size="sm" className="border-dashed border-border/70 bg-card/80 shadow-none">
                    <CardContent className="px-4 py-12 text-center text-sm leading-7 text-muted-foreground">
                        发送一条消息后，这里会展示回答过程（思考、工具调用、资源读取）及最终结果。
                    </CardContent>
                </Card>
            ) : null}

            {messages.map((message, messageIndex) => {
                const visibleParts = message.parts.filter(hasVisibleContent)
                const reasoningParts = visibleParts.filter((part): part is ReasoningPart => part.type === 'reasoning')
                const contentParts = visibleParts.filter(part => part.type !== 'reasoning')
                const combinedReasoning = buildCombinedReasoning(reasoningParts)
                const messageTextContent = getMessageTextContent(message)
                const hasTextContent = messageTextContent.trim().length > 0
                const isLatestAssistantMessage = message.role === 'assistant' && messageIndex === messages.length - 1
                const isAssistantReplyCompleted = !isLatestAssistantMessage || (status !== 'submitted' && status !== 'streaming')
                const hasNonReasoningContent = contentParts.length > 0
                const isThinking = isLatestAssistantMessage && !isAssistantReplyCompleted && !hasNonReasoningContent
                const feedbackState = assistantFeedback[message.id] ?? null
                const isDeleteDisabled = status === 'submitted' || status === 'streaming'
                const isCopied = copiedMessageId === message.id

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
                        <article key={message.id} className="group flex justify-end">
                            <div className="w-fit max-w-[44rem]">
                                <div className="rounded-2xl bg-primary/10 px-3.5 py-2.5 text-foreground shadow-xs">
                                    {contentParts.map((part, index) => {
                                        if (part.type === 'text') {
                                            return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                                        }

                                        return null
                                    })}
                                </div>

                                <div className="mt-1.5 flex justify-end gap-1  text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="复制用户消息"
                                        title="复制"
                                        onClick={() => void handleCopy(message)}
                                        className={getCopiedButtonClassName(isCopied)}
                                    >
                                        {isCopied ? (
                                            <Check className="size-3.5" strokeWidth={2.2} />
                                        ) : (
                                            <Copy className="size-3.5" strokeWidth={2.2} />
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="删除当前问答"
                                        title="删除"
                                        onClick={() => onDeleteUserTurn(message.id)}
                                        disabled={isDeleteDisabled}
                                        className="hover:text-rose-700"
                                    >
                                        <Trash2 className="size-3.5" strokeWidth={2.2} />
                                    </Button>
                                </div>
                            </div>
                        </article>
                    )
                }

                return (
                    <article key={message.id} className="flex justify-start">
                        <div className="w-full max-w-[51rem] text-foreground">
                            <ReasoningPanel combinedReasoning={combinedReasoning} isThinking={isThinking} />

                            {contentParts.map((part, index) => {
                                if (part.type === 'text') {
                                    return <TextPartView key={`${message.id}:text:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'tool') {
                                    return <ToolPanel key={`${message.id}:tool:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'resource') {
                                    return <ResourcePanel key={`${message.id}:resource:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'skill') {
                                    return <SkillPanel key={`${message.id}:skill:${part.id ?? index}`} part={part} />
                                }

                                if (part.type === 'prompt') {
                                    return <PromptPanel key={`${message.id}:prompt:${part.id ?? index}`} part={part} />
                                }

                                return null
                            })}

                            {hasTextContent && isAssistantReplyCompleted ? (
                                <div className="mt-2 flex items-center gap-1 text-muted-foreground">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="复制回复"
                                        title="复制"
                                        onClick={() => void handleCopy(message)}
                                        className={getCopiedButtonClassName(isCopied)}
                                    >
                                        {isCopied ? (
                                            <Check className="size-3.5" strokeWidth={2.2} />
                                        ) : (
                                            <Copy className="size-3.5" strokeWidth={2.2} />
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="点赞"
                                        title="点赞"
                                        onClick={() => toggleAssistantFeedback(message.id, 'up')}
                                        className={getFeedbackButtonClassName(feedbackState === 'up', 'up')}
                                    >
                                        <ThumbsUp className="size-3.5" strokeWidth={2.2} />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="点踩"
                                        title="点踩"
                                        onClick={() => toggleAssistantFeedback(message.id, 'down')}
                                        className={getFeedbackButtonClassName(feedbackState === 'down', 'down')}
                                    >
                                        <ThumbsDown className="size-3.5" strokeWidth={2.2} />
                                    </Button>
                                    {isLatestAssistantMessage ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label="重新生成"
                                            title="重新生成"
                                            onClick={() => void onRegenerateLastTurn()}
                                        >
                                            <RotateCcw className="size-3.5" strokeWidth={2.2} />
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </article>
                )
            })}
        </div>
    )
}
