import type { MindMessage, MindMessagePart, ReasoningPart, ResourcePart, ToolPart } from '@/lib/ai/types/message'

export type ChatListStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type AssistantFeedback = 'up' | 'down' | null

export interface RateLimitNoticeViewModel {
    title: string
    description: string
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
        case 'agent-run':
        case 'agent-graph':
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
