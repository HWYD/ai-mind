import { CircleAlert, CircleCheckBig, LoaderCircle } from 'lucide-react'

import type { MindMessage, MindMessagePart, PromptPart, ReasoningPart, ResourcePart, ToolPart } from '@/lib/ai/types/message'

export type ChatListStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type RuntimePartStatus = 'called' | 'completed' | 'failed' | 'loading'
export type AssistantFeedback = 'up' | 'down' | null

export interface RateLimitNoticeViewModel {
    title: string
    description: string
}

const promptInputLabelMap: Record<string, string> = {
    filename: '文件名',
    goal: '目标',
    theme: '主题',
    userGoal: '用户目标',
}

export function hasVisibleContent(part: MindMessagePart) {
    switch (part.type) {
        case 'text':
        case 'reasoning':
            return part.text.trim().length > 0
        case 'tool':
        case 'resource':
        case 'skill':
        case 'prompt':
        case 'workflow-progress':
        case 'image-brief':
        case 'image-result':
        case 'agent-step':
            return true
        case 'thread-memory-status':
        case 'agent-interrupt':
            return false
        default:
            return false
    }
}

export function buildCombinedReasoning(reasoningParts: ReasoningPart[]) {
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

export function getToolTitle(part: ToolPart) {
    return part.title ?? part.toolName
}

export function getActionLabel(action?: string) {
    if (!action) {
        return null
    }

    const labelMap: Record<string, string> = {
        add: '日期偏移',
        convert: '单位换算',
        current: '实时天气',
        evaluate: '计算',
        'extract-code-blocks': '提取代码块',
        'extract-links': '提取链接',
        'json-pretty': 'JSON 格式化',
        'markdown-to-text': 'Markdown 转纯文本',
        now: '当前时间',
        read: '读取文件',
        weekday: '星期判断',
    }

    return labelMap[action] ?? action
}

export function getToolStatusLabel(status: ToolPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '执行中'
    }
}

export function getResourceStatusLabel(status: ResourcePart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '读取中'
    }
}

export function getPromptStatusLabel(status: PromptPart['status']) {
    switch (status) {
        case 'completed':
            return '已完成'
        case 'failed':
            return '失败'
        default:
            return '处理中'
    }
}

export function parsePromptInputRows(input: string) {
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

export function renderStatusIcon(status: RuntimePartStatus) {
    switch (status) {
        case 'completed':
            return <CircleCheckBig className="size-3.5" strokeWidth={2.2} />
        case 'failed':
            return <CircleAlert className="size-3.5" strokeWidth={2.2} />
        default:
            return <LoaderCircle className="size-3.5 animate-spin" strokeWidth={2.2} />
    }
}

export function getStatusVariant(status: RuntimePartStatus): 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'completed':
            return 'secondary'
        case 'failed':
            return 'destructive'
        default:
            return 'outline'
    }
}

export function getStatusClassName(status: RuntimePartStatus) {
    switch (status) {
        case 'completed':
            return 'border-emerald-200 bg-emerald-50 text-emerald-700'
        case 'failed':
            return 'border-rose-200 bg-rose-50 text-rose-700'
        default:
            return 'border-sky-200 bg-sky-50 text-sky-700'
    }
}

export function getSourceLabel(source?: ToolPart['source']) {
    return source === 'mcp' ? 'MCP' : '内建'
}

export function getLocationLabel(location?: ToolPart['location']) {
    return location === 'remote' ? 'remote' : 'local'
}

export function getMessageTextContent(message: MindMessage) {
    return message.parts
        .filter((part): part is Extract<MindMessagePart, { type: 'text' }> => part.type === 'text' && part.text.trim().length > 0)
        .map(part => part.text)
        .join('\n\n')
}

export function getRateLimitNoticeViewModel(text: string): RateLimitNoticeViewModel | null {
    const normalizedText = text.trim()

    if (!/^(聊天|任务清单)请求已达到/.test(normalizedText)) {
        return null
    }

    const limitCountMatch = normalizedText.match(/（(\d+)\s*次）/)

    if (!limitCountMatch) {
        return null
    }

    const limitCount = limitCountMatch[1]
    const limitScope = normalizedText.includes('当前会话') ? '当前会话' : '当前 IP'

    return {
        title: '今日体验次数已用完',
        description: `${limitScope} 今日最多可体验 ${limitCount} 次，请明天再试。`,
    }
}

export function isRateLimitNoticeMessage(message: MindMessage) {
    return getRateLimitNoticeViewModel(getMessageTextContent(message)) !== null
}

export function getMessageCopyText(message: MindMessage) {
    if (message.role !== 'user') {
        return getMessageTextContent(message)
    }

    const textPartWithDisplaySegments = message.parts.find(part => part.type === 'text' && (part.displaySegments?.length ?? 0) > 0)

    if (textPartWithDisplaySegments?.type !== 'text' || !textPartWithDisplaySegments.displaySegments?.length) {
        return getMessageTextContent(message)
    }

    return textPartWithDisplaySegments.displaySegments
        .map(segment => {
            if (segment.type === 'text') {
                return segment.text
            }

            if (segment.type === 'command') {
                return `/${segment.command.name}`
            }

            return `@${segment.reference.label}`
        })
        .join('')
}

export async function copyTextToClipboard(text: string) {
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

export function getCopiedButtonClassName(active: boolean) {
    return active ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 hover:text-sky-700' : ''
}

export function getFeedbackButtonClassName(active: boolean, tone: 'up' | 'down') {
    if (!active) {
        return ''
    }

    return tone === 'up'
        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-700'
        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-700'
}
