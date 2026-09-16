import { normalizeSafePublicHttpUrl } from '@/lib/ai/safe-public-url'
import type { MindMessagePart, ToolPart } from '@/lib/ai/types/message'

export type GeneralAgentTraceStatus = 'cancelled' | 'completed' | 'failed' | 'running'
export type GeneralAgentTraceRowKind = 'prompt' | 'resource' | 'skill' | 'tool'
export type GeneralAgentTraceRowStatus = 'completed' | 'failed' | 'running' | 'stopped'

export interface GeneralAgentTraceRow {
    id: string
    kind: GeneralAgentTraceRowKind
    label: string
    ordinal: number
    status: GeneralAgentTraceRowStatus
    toolName?: string
}

export interface GeneralAgentTraceSource {
    hostname: string
    title: string
    url: string
}

export interface GeneralAgentTraceView {
    readCount: number
    readSources: GeneralAgentTraceSource[]
    rows: GeneralAgentTraceRow[]
    searchCount: number
    status: GeneralAgentTraceStatus
}

function toCanonicalHttpUrl(value: string) {
    return normalizeSafePublicHttpUrl(value)
}

function getPartId(part: MindMessagePart, index: number) {
    return part.id ?? `${part.type}-${index + 1}`
}

function getRowStatus(part: MindMessagePart, status: GeneralAgentTraceStatus): GeneralAgentTraceRowStatus {
    let partStatus: GeneralAgentTraceRowStatus
    if (part.type === 'tool') {
        partStatus = part.status === 'called' ? 'running' : part.status
    } else if (part.type === 'resource') {
        partStatus = part.status === 'loading' ? 'running' : part.status
    } else if (part.type === 'prompt') {
        partStatus = part.status === 'called' ? 'running' : part.status
    } else {
        partStatus = 'completed'
    }

    if (partStatus !== 'running') {
        return partStatus
    }

    return status === 'cancelled' ? 'stopped' : status === 'failed' ? 'failed' : 'running'
}

function getToolRowLabel(part: ToolPart, status: GeneralAgentTraceRowStatus, searchCount: number, readCount: number) {
    switch (part.toolName) {
        case 'web-search':
            return status === 'running'
                ? '正在搜索网页'
                : status === 'completed'
                  ? `已搜索到 ${searchCount} 个来源`
                  : status === 'failed'
                    ? '搜索步骤未完成'
                    : '已停止搜索网页'
        case 'read-url':
            return status === 'running'
                ? '正在读取页面'
                : status === 'completed'
                  ? `已读取 ${readCount} 个页面`
                  : status === 'failed'
                    ? '读取步骤未完成'
                    : '已停止读取页面'
        case 'calculator':
            return status === 'running'
                ? '正在计算'
                : status === 'completed'
                  ? '已完成计算'
                  : status === 'failed'
                    ? '计算未完成'
                    : '已停止计算'
        case 'datetime':
            return status === 'running'
                ? '正在查询当前时间'
                : status === 'completed'
                  ? '已获取当前时间'
                  : status === 'failed'
                    ? '时间查询未完成'
                    : '已停止查询当前时间'
        default: {
            const title = part.title ?? part.toolName

            return status === 'running'
                ? `正在执行${title}`
                : status === 'completed'
                  ? `已完成${title}`
                  : status === 'failed'
                    ? `${title}未完成`
                    : `已停止${title}`
        }
    }
}

function getRowLabel(
    part: MindMessagePart,
    status: GeneralAgentTraceRowStatus,
    counts: Pick<GeneralAgentTraceView, 'readCount' | 'searchCount'>
) {
    switch (part.type) {
        case 'prompt':
            return status === 'running'
                ? `正在加载 ${part.promptName}`
                : status === 'completed'
                  ? `已加载 ${part.promptName}`
                  : `${part.promptName} 未完成`
        case 'resource':
            return status === 'running'
                ? `正在读取 ${part.resourceName}`
                : status === 'completed'
                  ? `已读取 ${part.resourceName}`
                  : `${part.resourceName} 未完成`
        case 'skill':
            return `加载了${part.name} Skill`
        case 'tool':
            return getToolRowLabel(part, status, counts.searchCount, counts.readCount)
    }
}

function getTraceParts(parts: MindMessagePart[]) {
    return parts.filter(
        (part): part is Extract<MindMessagePart, { type: GeneralAgentTraceRowKind }> =>
            part.type === 'prompt' || part.type === 'resource' || part.type === 'skill' || part.type === 'tool'
    )
}

function collectSafeSources(parts: MindMessagePart[]) {
    const searchUrls = new Set<string>()
    const readUrls = new Set<string>()
    const readSources: GeneralAgentTraceSource[] = []

    for (const part of parts) {
        if (part.type !== 'tool') {
            continue
        }

        for (const source of part.sources ?? []) {
            const url = toCanonicalHttpUrl(source.url)

            if (!url) {
                continue
            }

            if (source.originTool === 'web-search' && source.status !== 'unavailable') {
                searchUrls.add(url)
            }

            if (source.originTool === 'read-url' && source.status === 'read' && !readUrls.has(url)) {
                readUrls.add(url)
                readSources.push({ hostname: new URL(url).hostname, title: source.title, url })
            }
        }
    }

    return {
        readCount: readUrls.size,
        readSources: readSources.slice(0, 5),
        searchCount: searchUrls.size,
    }
}

export function buildGeneralAgentTraceView(parts: MindMessagePart[], status: GeneralAgentTraceStatus): GeneralAgentTraceView {
    const traceParts = getTraceParts(parts)
    const sources = collectSafeSources(traceParts)
    const rows = traceParts.map((part, index) => {
        const rowStatus = getRowStatus(part, status)

        return {
            id: getPartId(part, index),
            kind: part.type,
            label: getRowLabel(part, rowStatus, sources),
            ordinal: index + 1,
            status: rowStatus,
            toolName: part.type === 'tool' ? part.toolName : undefined,
        }
    })

    return {
        ...sources,
        rows,
        status,
    }
}
