import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

import type { LocalMessageHeightHintEntry } from '../../instamind/local-chat-persistence/schema'

export const MESSAGE_HEIGHT_HINT_GEOMETRY_VERSION = 1

const MAX_MESSAGE_HEIGHT_HINT = 8_000

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
    if (!Number.isFinite(value) || value <= 0 || value > MAX_MESSAGE_HEIGHT_HINT) {
        return undefined
    }

    return Math.round(value * 4) / 4
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

export function createMessageRenderFingerprint(message: MindMessage, requestComposer?: ChatComposerPayload) {
    return hashRenderInput(stableSerialize({ message, requestComposer }))
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
