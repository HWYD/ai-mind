import { describe, expect, it } from 'vitest'

import {
    createMessageHeightHintLayoutKey,
    createMessageRenderFingerprint,
    mergeMessageHeightHints,
    observeMessageHeightHintCandidate,
} from '@/components/chat/message-list/message-height-hints'
import type { LocalMessageHeightHintEntry } from '@/components/instamind/local-chat-persistence/schema'
import type { MindMessage } from '@/lib/ai/types/message'

function createMessage(text = '稳定高度消息'): MindMessage {
    return {
        createdAt: '2026-08-30T10:00:00.000Z',
        id: 'message-1',
        parts: [{ format: 'markdown', text, type: 'text' }],
        role: 'assistant',
        status: 'completed',
    }
}

function createHint(overrides: Partial<LocalMessageHeightHintEntry> = {}): LocalMessageHeightHintEntry {
    return {
        height: 248.25,
        measuredAt: '2026-08-30T10:00:00.000Z',
        messageId: 'message-1',
        presentation: 'history-default',
        renderFingerprint: 'fingerprint-a',
        ...overrides,
    }
}

describe('message height hints', () => {
    it('builds a layout key from geometry, exact message column width, reasoning and default presentation only', () => {
        expect(createMessageHeightHintLayoutKey({ enableReasoning: true, messageColumnWidth: 856 })).toBe('g1|w856|r1|history-default')
        expect(createMessageHeightHintLayoutKey({ enableReasoning: false, messageColumnWidth: 856 })).toBe('g1|w856|r0|history-default')
        expect(createMessageHeightHintLayoutKey({ enableReasoning: true, messageColumnWidth: 720 })).toBe('g1|w720|r1|history-default')
    })

    it('creates an opaque render fingerprint that changes when visible content or request presentation changes', () => {
        const message = createMessage()
        const sameMessageFingerprint = createMessageRenderFingerprint(message)

        expect(sameMessageFingerprint).toBe(createMessageRenderFingerprint(message))
        expect(sameMessageFingerprint).not.toContain('稳定高度消息')
        expect(sameMessageFingerprint).not.toBe(createMessageRenderFingerprint(createMessage('内容已经变化')))
        expect(sameMessageFingerprint).not.toBe(
            createMessageRenderFingerprint(message, {
                command: { label: '生成交付计划', name: 'delivery-chain' },
                plainText: '',
            })
        )
    })

    it('uses only an exact default-presentation fingerprint hit and otherwise keeps the structural estimate', () => {
        const entries = [
            { estimatedHeight: 160, messageId: 'message-1', renderFingerprint: 'fingerprint-a' },
            { estimatedHeight: 320, messageId: 'message-2', renderFingerprint: 'fingerprint-b' },
            { estimatedHeight: 480, messageId: 'message-3', renderFingerprint: 'fingerprint-c' },
        ]

        expect(
            mergeMessageHeightHints(entries, [
                createHint(),
                createHint({ height: 512, messageId: 'message-2', renderFingerprint: 'changed' }),
                createHint({ height: 640, messageId: 'message-3', renderFingerprint: 'fingerprint-c' }),
            ])
        ).toEqual([248.25, 320, 640])
    })

    it('requires two matching normalized measurements before a candidate becomes stable and resets when its size changes', () => {
        const first = observeMessageHeightHintCandidate(undefined, {
            height: 248.19,
            renderFingerprint: 'fingerprint-a',
        })
        const stable = observeMessageHeightHintCandidate(first, {
            height: 248.24,
            renderFingerprint: 'fingerprint-a',
        })
        const changed = observeMessageHeightHintCandidate(stable, {
            height: 256,
            renderFingerprint: 'fingerprint-a',
        })

        expect(first).toEqual({ height: 248.25, observationCount: 1, renderFingerprint: 'fingerprint-a' })
        expect(stable).toEqual({ height: 248.25, observationCount: 2, renderFingerprint: 'fingerprint-a' })
        expect(changed).toEqual({ height: 256, observationCount: 1, renderFingerprint: 'fingerprint-a' })
        expect(observeMessageHeightHintCandidate(stable, { height: 0, renderFingerprint: 'fingerprint-a' })).toBeUndefined()
    })
})
