import { describe, expect, it } from 'vitest'

import {
    createMessageHeightHintLayoutKey,
    createMessageRenderFingerprint,
    mergeMessageHeightHints,
    observeMessageHeightHintCandidate,
} from '@/components/chat/message-list/message-height-hints'
import type { LocalMessageHeightHintEntry } from '@/components/instamind/local-chat-persistence/schema'
import { projectRecoverableMessages } from '@/components/instamind/local-chat-persistence/stable-snapshot'
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
        expect(createMessageHeightHintLayoutKey({ enableReasoning: true, messageColumnWidth: 856 })).toBe('g2|w856|r1|history-default')
        expect(createMessageHeightHintLayoutKey({ enableReasoning: false, messageColumnWidth: 856 })).toBe('g2|w856|r0|history-default')
        expect(createMessageHeightHintLayoutKey({ enableReasoning: true, messageColumnWidth: 720 })).toBe('g2|w720|r1|history-default')
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

    it('keeps the same fingerprint when runtime-only raw fields are removed by the stable snapshot projection', () => {
        const runtimeMessage: MindMessage = {
            ...createMessage(),
            parts: [
                {
                    action: 'read',
                    error: undefined,
                    id: 'tool-1',
                    input: '{"url":"https://example.com"}',
                    location: 'remote',
                    output: '{"content":"private"}',
                    serverId: 'mcp-server',
                    source: 'mcp',
                    status: 'completed',
                    title: '读取网页',
                    toolName: 'read-url',
                    type: 'tool',
                },
                {
                    contentPreview: 'private resource body',
                    error: undefined,
                    id: 'resource-1',
                    isTruncated: true,
                    location: 'remote',
                    previewChars: 20,
                    resourceName: 'page.md',
                    serverId: 'mcp-server',
                    source: 'mcp',
                    status: 'completed',
                    type: 'resource',
                    uri: 'https://example.com/page.md',
                },
                {
                    error: undefined,
                    id: 'prompt-1',
                    input: 'private prompt arguments',
                    location: 'remote',
                    messageCount: 1,
                    promptName: 'summarize',
                    serverId: 'mcp-server',
                    source: 'mcp',
                    status: 'completed',
                    type: 'prompt',
                },
                { id: 'text-1', format: 'markdown', text: '稳定回答', type: 'text' },
            ],
        }
        const recoveredMessage = projectRecoverableMessages([runtimeMessage])[0]

        expect(recoveredMessage).toBeDefined()
        expect(createMessageRenderFingerprint(runtimeMessage)).toBe(createMessageRenderFingerprint(recoveredMessage as MindMessage))
    })

    it('uses the same safe URL projection as the stable snapshot for height-hint fingerprints', () => {
        const runtimeMessage: MindMessage = {
            ...createMessage('安全投影回答'),
            parts: [
                {
                    id: 'tool-unsafe-source',
                    input: '{}',
                    sources: [
                        {
                            originTool: 'read-url',
                            sourceId: 'unsafe-source',
                            status: 'read',
                            title: 'Private source',
                            url: 'https://user:password@example.com/private',
                        },
                    ],
                    status: 'completed',
                    toolName: 'read-url',
                    type: 'tool',
                },
                {
                    id: 'resource-unsafe-uri',
                    resourceName: 'Private resource',
                    serverId: 'mcp-server',
                    status: 'completed',
                    type: 'resource',
                    uri: 'http://127.0.0.1/metadata',
                },
                { format: 'markdown', id: 'text-safe-projection', text: '安全投影回答', type: 'text' },
            ],
        }
        const recoveredMessage = projectRecoverableMessages([runtimeMessage])[0]

        expect(recoveredMessage).toBeDefined()
        expect(recoveredMessage?.parts).toEqual([
            {
                id: 'tool-unsafe-source',
                status: 'completed',
                toolName: 'read-url',
                type: 'tool',
            },
            {
                id: 'resource-unsafe-uri',
                resourceName: 'Private resource',
                serverId: 'mcp-server',
                status: 'completed',
                type: 'resource',
                uri: 'resource://unknown',
            },
            { format: 'markdown', id: 'text-safe-projection', text: '安全投影回答', type: 'text' },
        ])
        const publicMessage: MindMessage = {
            ...runtimeMessage,
            parts: [
                {
                    id: 'tool-unsafe-source',
                    input: '{}',
                    sources: [],
                    status: 'completed',
                    toolName: 'read-url',
                    type: 'tool',
                },
                {
                    id: 'resource-unsafe-uri',
                    resourceName: 'Private resource',
                    serverId: 'mcp-server',
                    status: 'completed',
                    type: 'resource',
                    uri: 'resource://unknown',
                },
                { format: 'markdown', id: 'text-safe-projection', text: '安全投影回答', type: 'text' },
            ],
        }

        expect(createMessageRenderFingerprint(runtimeMessage)).toBe(createMessageRenderFingerprint(publicMessage))
    })

    it('invalidates completed fingerprints when stable snapshot projection drops rendered parts', () => {
        const runtimeMessage: MindMessage = {
            ...createMessage('完成态回答'),
            artifacts: [
                {
                    artifactId: 'artifact-completed',
                    artifactKind: 'plan',
                    artifactType: 'text',
                    content: '稳定产物',
                    format: 'markdown',
                    status: 'completed',
                    title: '方案',
                },
                {
                    artifactId: 'artifact-streaming',
                    artifactKind: 'plan',
                    artifactType: 'text',
                    content: '半成品',
                    format: 'markdown',
                    status: 'streaming',
                    title: '半成品',
                },
            ],
            parts: [
                {
                    agentName: 'tasklist-agent',
                    graph: {
                        nodes: [],
                        routes: [],
                        runtime: 'LangGraph',
                    },
                    id: 'invalid-graph',
                    rawDebugState: 'runtime-only',
                    runId: 'graph-1',
                    status: 'completed',
                    type: 'agent-graph',
                } as unknown as MindMessage['parts'][number],
                { format: 'markdown', text: '完成态回答', type: 'text' },
            ],
        }
        const recoveredMessage = projectRecoverableMessages([runtimeMessage])[0]

        expect(recoveredMessage).toBeDefined()
        expect(recoveredMessage?.parts.map(part => part.type)).toEqual(['text'])
        expect(recoveredMessage?.artifacts?.map(artifact => artifact.artifactId)).toEqual(['artifact-completed'])
        expect(createMessageRenderFingerprint(runtimeMessage)).not.toBe(createMessageRenderFingerprint(recoveredMessage as MindMessage))
    })

    it('preserves measured heights above 8,000px without imposing a maximum', () => {
        expect(
            observeMessageHeightHintCandidate(undefined, {
                height: 12_345.5,
                renderFingerprint: 'fingerprint-long',
            })
        ).toEqual({ height: 12_345.5, observationCount: 1, renderFingerprint: 'fingerprint-long' })
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
