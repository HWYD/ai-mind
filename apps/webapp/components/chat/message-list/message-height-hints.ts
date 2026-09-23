import { normalizeSafePublicHttpUrl, normalizeSafeResourceUri } from '@/lib/ai/safe-public-url'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage, MindMessagePart } from '@/lib/ai/types/message'

import { type LocalMessageHeightHintEntry, recoverableAgentGraphPartSchema } from '../../instamind/local-chat-persistence/schema'

export const MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION = 3

export interface MessageHeightHintEstimateEntry {
    estimatedHeight: number
    messageId: string
    renderFingerprint: string
}

export interface MessageHeightHintCandidate {
    height: number
    observationCount: number
    renderFingerprint: string
}

function normalizeMessageHeightHintValue(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
        return undefined
    }

    const normalized = Math.round(value * 4) / 4

    return Number.isFinite(normalized) ? normalized : undefined
}

function formatLayoutWidth(messageColumnWidth: number) {
    const normalizedWidth = Math.round(messageColumnWidth * 4) / 4

    return Number.isInteger(normalizedWidth) ? String(normalizedWidth) : normalizedWidth.toFixed(2).replace(/0+$/, '')
}

function stableSerialize(value: unknown): string {
    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value)
    }

    if (Array.isArray(value)) {
        return `[${value.map(item => stableSerialize(item)).join(',')}]`
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>
        const entries = Object.keys(record)
            .sort()
            .flatMap(key => (record[key] === undefined ? [] : [`${JSON.stringify(key)}:${stableSerialize(record[key])}`]))

        return `{${entries.join(',')}}`
    }

    return JSON.stringify(String(value))
}

function hashRenderInput(value: string) {
    let hash = 0x811c9dc5

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }

    return `fnv1a-${(hash >>> 0).toString(36)}`
}

export function createMessageHeightHintLayoutKey({
    enableReasoning,
    messageColumnWidth,
}: {
    enableReasoning: boolean
    messageColumnWidth: number
}) {
    return `g${MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION}|w${formatLayoutWidth(messageColumnWidth)}|r${enableReasoning ? 1 : 0}|history-default`
}

function projectPublicSourceRecords(sources: Extract<MindMessagePart, { type: 'tool' }>['sources']) {
    return (sources ?? []).flatMap(source => {
        if (source.status !== 'discovered' && source.status !== 'read') {
            return []
        }

        const url = normalizeSafePublicHttpUrl(source.url)

        if (!url) {
            return []
        }

        return [
            {
                originTool: source.originTool,
                sourceId: source.sourceId,
                status: source.status,
                title: source.title,
                url,
            },
        ]
    })
}

// 与 stable snapshot 的 public allowlist 对齐，避免 raw 字段变化让已测量高度在刷新后失配。
function isPersistedPart(part: MindMessagePart) {
    if (part.type === 'agent-run') {
        return part.status === 'completed'
    }

    if (part.type === 'agent-text') {
        return part.status === 'completed' && (part.phase === 'commentary' || part.phase === 'final_answer')
    }

    if (
        part.type !== 'agent-graph' &&
        part.type !== 'image-brief' &&
        part.type !== 'image-result' &&
        part.type !== 'prompt' &&
        part.type !== 'resource' &&
        part.type !== 'skill' &&
        part.type !== 'text' &&
        part.type !== 'tool' &&
        part.type !== 'workflow-progress'
    ) {
        return false
    }

    if ('status' in part) {
        return part.status === undefined || part.status === 'completed' || part.status === 'failed'
    }

    return true
}

function projectMessagePartForFingerprint(part: MindMessagePart) {
    if (!isPersistedPart(part)) {
        return { id: part.id, type: 'ephemeral', originalType: part.type }
    }

    if (part.type === 'tool') {
        const sources = projectPublicSourceRecords(part.sources)

        return {
            ...(part.id ? { id: part.id } : {}),
            ...(part.action ? { action: part.action } : {}),
            ...(part.location ? { location: part.location } : {}),
            ...(part.serverId ? { serverId: part.serverId } : {}),
            ...(sources.length > 0 ? { sources } : {}),
            ...(part.source ? { source: part.source } : {}),
            status: part.status,
            title: part.title,
            toolName: part.toolName,
            type: 'tool',
        }
    }

    if (part.type === 'resource') {
        const uri = normalizeSafeResourceUri(part.uri) ?? 'resource://unknown'

        return {
            ...(part.id ? { id: part.id } : {}),
            ...(part.location ? { location: part.location } : {}),
            resourceName: part.resourceName,
            serverId: part.serverId,
            ...(part.source ? { source: part.source } : {}),
            status: part.status,
            type: 'resource',
            uri,
        }
    }

    if (part.type === 'prompt') {
        return {
            ...(part.id ? { id: part.id } : {}),
            ...(part.location ? { location: part.location } : {}),
            ...(typeof part.messageCount === 'number' ? { messageCount: part.messageCount } : {}),
            promptName: part.promptName,
            ...(part.serverId ? { serverId: part.serverId } : {}),
            ...(part.source ? { source: part.source } : {}),
            status: part.status,
            type: 'prompt',
        }
    }

    if (part.type === 'skill') {
        return {
            ...(part.id ? { id: part.id } : {}),
            name: part.name,
            skillId: part.skillId,
            type: 'skill',
        }
    }

    if (part.type === 'text') {
        return {
            ...(part.displaySegments?.length ? { displaySegments: part.displaySegments } : {}),
            ...(part.id ? { id: part.id } : {}),
            format: 'markdown',
            text: part.text,
            type: 'text',
        }
    }

    if (part.type === 'agent-text') {
        return {
            format: 'markdown',
            id: part.id,
            modelTurnId: part.modelTurnId,
            phase: part.phase,
            runId: part.runId,
            status: part.status,
            text: part.text,
            type: 'agent-text',
        }
    }

    if (part.type === 'image-brief') {
        return {
            ...(part.id ? { id: part.id } : {}),
            runId: part.runId,
            summary: {
                ...part.summary,
                assumptions: [...part.summary.assumptions],
                avoid: [...part.summary.avoid],
                mustInclude: [...part.summary.mustInclude],
                subjects: [...part.summary.subjects],
                ...(part.summary.visibleText ? { visibleText: [...part.summary.visibleText] } : {}),
            },
            type: 'image-brief',
        }
    }

    if (part.type === 'image-result') {
        return {
            ...(part.height ? { height: part.height } : {}),
            ...(part.id ? { id: part.id } : {}),
            ...(part.mimeType ? { mimeType: part.mimeType } : {}),
            contentPath: part.contentPath,
            expiresAt: part.expiresAt,
            runId: part.runId,
            suggestedFileName: part.suggestedFileName,
            temporary: true,
            type: 'image-result',
            ...(part.width ? { width: part.width } : {}),
        }
    }

    if (part.type === 'agent-run') {
        return {
            ...(part.finalizationMode ? { finalizationMode: part.finalizationMode } : {}),
            ...(part.id ? { id: part.id } : {}),
            runId: part.runId,
            status: part.status,
            type: 'agent-run',
        }
    }

    if (part.type === 'agent-graph') {
        const parsed = recoverableAgentGraphPartSchema.safeParse(part)

        return parsed.success ? parsed.data : { id: part.id, originalType: part.type, type: 'ephemeral' }
    }

    return part
}

export function createMessageRenderFingerprint(message: MindMessage, requestComposer?: ChatComposerPayload) {
    const fingerprintMessage = {
        ...message,
        parts: message.parts.map(projectMessagePartForFingerprint),
        status: message.status ?? 'completed',
    }

    return hashRenderInput(stableSerialize({ message: fingerprintMessage, requestComposer }))
}

export function mergeMessageHeightHints(entries: MessageHeightHintEstimateEntry[], hints: LocalMessageHeightHintEntry[]): number[] {
    const hintsByMessageId = new Map(hints.map(hint => [hint.messageId, hint]))

    return entries.map(entry => {
        const hint = hintsByMessageId.get(entry.messageId)

        return hint?.presentation === 'history-default' && hint.renderFingerprint === entry.renderFingerprint
            ? hint.height
            : entry.estimatedHeight
    })
}

export function observeMessageHeightHintCandidate(
    previous: MessageHeightHintCandidate | undefined,
    next: {
        height: number
        renderFingerprint: string
    }
): MessageHeightHintCandidate | undefined {
    const height = normalizeMessageHeightHintValue(next.height)

    if (!height) {
        return undefined
    }

    return {
        height,
        observationCount:
            previous?.height === height && previous.renderFingerprint === next.renderFingerprint
                ? Math.min(2, previous.observationCount + 1)
                : 1,
        renderFingerprint: next.renderFingerprint,
    }
}
