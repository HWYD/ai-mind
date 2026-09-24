import { normalizeSafePublicHttpUrl } from '@/lib/ai/safe-public-url'
import type { AgentTextPart, MindMessagePart, ToolPart } from '@/lib/ai/types/message'

export type GeneralAgentTraceStatus = 'cancelled' | 'completed' | 'failed' | 'running'
export type GeneralAgentTraceDetailRowKind = 'prompt' | 'resource' | 'skill' | 'tool'
export type GeneralAgentTraceRowStatus = 'completed' | 'failed' | 'running' | 'stopped'

export interface GeneralAgentTraceTextRow {
    id: string
    kind: 'agent-text'
    ordinal: number
    part: AgentTextPart
    status: GeneralAgentTraceRowStatus
}

export interface GeneralAgentTraceDetailRow {
    id: string
    kind: GeneralAgentTraceDetailRowKind
    label: string
    ordinal: number
    readSources?: GeneralAgentTraceSource[]
    status: GeneralAgentTraceRowStatus
    toolName?: string
}

export type GeneralAgentTraceRow = GeneralAgentTraceDetailRow | GeneralAgentTraceTextRow

export interface GeneralAgentTraceSource {
    hostname: string
    title: string
    url: string
}

export interface GeneralAgentTraceView {
    hasFoldableDetails: boolean
    readCount: number
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
    } else if (part.type === 'agent-text') {
        partStatus = part.status === 'streaming' ? 'running' : part.status === 'interrupted' ? 'stopped' : 'completed'
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

type GeneralAgentTraceDetailPart = Extract<MindMessagePart, { type: GeneralAgentTraceDetailRowKind }>
type GeneralAgentTracePart = AgentTextPart | GeneralAgentTraceDetailPart

function getRowLabel(
    part: GeneralAgentTraceDetailPart,
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

function isTracePart(part: MindMessagePart): part is GeneralAgentTracePart {
    return (
        part.type === 'prompt' ||
        part.type === 'resource' ||
        part.type === 'skill' ||
        part.type === 'tool' ||
        (part.type === 'agent-text' && part.phase !== 'final_answer' && part.text.trim().length > 0)
    )
}

function collectSafeSources(traceParts: Array<{ index: number; part: GeneralAgentTracePart }>) {
    const searchUrls = new Set<string>()
    const searchCountsByToolId = new Map<string, number>()
    const readUrls = new Set<string>()
    const readSourcesByToolId = new Map<string, GeneralAgentTraceSource[]>()
    let renderedReadSourceCount = 0

    for (const { index, part } of traceParts) {
        if (part.type !== 'tool') {
            continue
        }

        const toolPartId = getPartId(part, index)
        const toolSearchUrls = new Set<string>()

        for (const source of part.sources ?? []) {
            const url = toCanonicalHttpUrl(source.url)

            if (!url) {
                continue
            }

            if (source.originTool === 'web-search' && source.status === 'discovered') {
                searchUrls.add(url)
                toolSearchUrls.add(url)
            }

            if (source.originTool === 'read-url' && source.status === 'read' && !readUrls.has(url)) {
                readUrls.add(url)

                if (renderedReadSourceCount < 5) {
                    const toolReadSources = readSourcesByToolId.get(toolPartId) ?? []

                    toolReadSources.push({ hostname: new URL(url).hostname, title: source.title, url })
                    readSourcesByToolId.set(toolPartId, toolReadSources)
                    renderedReadSourceCount += 1
                }
            }
        }

        if (part.toolName === 'web-search') {
            searchCountsByToolId.set(toolPartId, toolSearchUrls.size)
        }
    }

    return {
        readCount: readUrls.size,
        readSourcesByToolId,
        searchCount: searchUrls.size,
        searchCountsByToolId,
    }
}

export function buildGeneralAgentTraceView(parts: MindMessagePart[], status: GeneralAgentTraceStatus): GeneralAgentTraceView {
    const traceParts = parts.flatMap((part, index) => (isTracePart(part) ? [{ index, part }] : []))
    const sources = collectSafeSources(traceParts)
    const rows = traceParts.map(({ index, part }) => {
        const rowStatus = getRowStatus(part, status)

        if (part.type === 'agent-text') {
            return {
                id: getPartId(part, index),
                kind: 'agent-text' as const,
                ordinal: index + 1,
                part,
                status: rowStatus,
            }
        }

        const id = getPartId(part, index)
        const counts =
            part.type === 'tool' && part.toolName === 'web-search'
                ? { ...sources, searchCount: sources.searchCountsByToolId.get(id) ?? 0 }
                : sources

        return {
            id,
            kind: part.type,
            label: getRowLabel(part, rowStatus, counts),
            ordinal: index + 1,
            readSources: part.type === 'tool' ? sources.readSourcesByToolId.get(id) : undefined,
            status: rowStatus,
            toolName: part.type === 'tool' ? part.toolName : undefined,
        }
    })

    return {
        ...sources,
        hasFoldableDetails: traceParts.some(({ part }) => part.type !== 'agent-text' || part.phase === 'commentary'),
        rows,
        status,
    }
}
