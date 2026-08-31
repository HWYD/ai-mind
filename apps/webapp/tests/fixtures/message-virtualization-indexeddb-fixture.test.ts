import { describe, expect, it } from 'vitest'

import type { LocalConversationSnapshot } from '@/components/instamind/local-chat-persistence/schema'
import type { MindMessage } from '@/lib/ai/types/message'

import { buildIndexedDbFixturePayload, getIndexedDbFixtureCleanupTargets } from './message-virtualization-indexeddb-fixture'

const fixtureNow = '2026-08-28T00:00:00.000Z'

function createSnapshot(conversationId: string, messages: MindMessage[]): LocalConversationSnapshot {
    return {
        conversationId,
        createdAt: fixtureNow,
        lastActiveAt: fixtureNow,
        messages,
        revision: 1,
        schemaVersion: 1 as const,
        snapshotAt: fixtureNow,
        title: conversationId,
    }
}

function createTextMessage(id: string, role: 'assistant' | 'user', text: string): MindMessage {
    return {
        createdAt: fixtureNow,
        id,
        parts: [{ format: 'markdown', id: `${id}-text`, text, type: 'text' }],
        role,
        status: 'completed',
    }
}

describe('buildIndexedDbFixturePayload', () => {
    it('builds an isolated exact 1,000-message payload from valid local donors', () => {
        const primarySnapshot = createSnapshot('conversation-largest', [
            createTextMessage('primary-user', 'user', '原始问题'),
            createTextMessage('primary-assistant', 'assistant', '原始回答'),
            createTextMessage('primary-user-two', 'user', '继续追问'),
            createTextMessage('primary-assistant-two', 'assistant', '继续回答'),
        ])
        const imageSnapshot = createSnapshot('conversation-image', [
            {
                createdAt: fixtureNow,
                id: 'image-message',
                parts: [
                    {
                        id: 'image-brief',
                        runId: 'source-image-run',
                        summary: {
                            assumptions: [],
                            avoid: [],
                            intent: '生成图测试',
                            mustInclude: ['山脉'],
                            subjects: ['山脉'],
                        },
                        type: 'image-brief',
                    },
                    {
                        contentPath: '/api/chat/runs/source-image-run/image',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                        id: 'image-result',
                        mimeType: 'image/png',
                        runId: 'source-image-run',
                        suggestedFileName: 'source.png',
                        temporary: true,
                        type: 'image-result',
                    },
                ],
                role: 'assistant',
                status: 'completed',
            },
        ])
        const agentSnapshot = createSnapshot('conversation-agent', [
            {
                createdAt: fixtureNow,
                id: 'agent-message',
                parts: [
                    {
                        agentName: 'Tasklist Agent',
                        graph: {
                            debugSummary: {
                                checkpointMode: 'memory',
                                currentNode: 'finish',
                                draftRevisions: 0,
                                manualReviewItemCount: 0,
                                maxDraftRevisions: 1,
                                maxOptionalContextReads: 1,
                                maxSteps: 12,
                                optionalContextReads: 0,
                                runId: 'source-agent-run',
                                runtimeMode: 'graph',
                                stepCount: 1,
                                threadId: 'source-agent-thread',
                                visitedNodes: ['finish'],
                            },
                            nodes: [
                                {
                                    nodeId: 'finish',
                                    partId: 'source-agent-part',
                                    patchSummaries: ['完成'],
                                    status: 'completed',
                                    stepIndex: 1,
                                    title: '完成',
                                },
                            ],
                            routes: [],
                            runtime: 'LangGraph',
                        },
                        id: 'source-agent-part',
                        runId: 'source-agent-run',
                        status: 'completed',
                        type: 'agent-step',
                    },
                ],
                role: 'assistant',
                status: 'completed',
            },
        ])

        const result = buildIndexedDbFixturePayload({
            conversationId: 'server-backed-test-conversation',
            imageCacheEntries: [
                {
                    blob: new Blob(['image'], { type: 'image/png' }),
                    byteLength: 5,
                    conversationId: 'conversation-image',
                    createdAt: fixtureNow,
                    lastAccessedAt: fixtureNow,
                    mimeType: 'image/png',
                    runId: 'source-image-run',
                },
            ],
            snapshots: [primarySnapshot, imageSnapshot, agentSnapshot],
        })

        expect(result.messages).toHaveLength(1000)
        expect(result.primaryMessageCount).toBeGreaterThanOrEqual(900)
        expect(result.conversationId).toBe('server-backed-test-conversation')
        expect(result.sourceSummary.primaryConversationId).toBe('conversation-largest')
        expect(new Set(result.messages.map(message => message.id)).size).toBe(1000)
        expect(new Set(result.messages.flatMap(message => message.parts.map(part => part.id))).size).toBe(
            result.messages.reduce((count, message) => count + message.parts.length, 0)
        )
        expect(
            new Set(result.messages.flatMap(message => message.parts.filter(part => part.type === 'image-result').map(part => part.runId)))
        ).toEqual(new Set([result.imageCacheEntry.runId]))
        expect(result.imageCacheEntry.conversationId).toBe(result.conversationId)
    })

    it('rejects a missing cached image donor before it can produce a fixture payload', () => {
        const imageMessage: MindMessage = {
            createdAt: fixtureNow,
            id: 'image-message',
            parts: [
                {
                    contentPath: '/api/chat/runs/missing-image/image',
                    expiresAt: '2099-01-01T00:00:00.000Z',
                    id: 'image-result',
                    runId: 'missing-image',
                    suggestedFileName: 'missing.png',
                    temporary: true,
                    type: 'image-result',
                },
            ],
            role: 'assistant',
            status: 'completed',
        }
        const agentMessage: MindMessage = {
            createdAt: fixtureNow,
            id: 'agent-message',
            parts: [
                {
                    agentName: 'Tasklist Agent',
                    graph: { nodes: [], routes: [], runtime: 'LangGraph' },
                    id: 'agent-step',
                    runId: 'agent-run',
                    status: 'completed',
                    type: 'agent-step',
                },
            ],
            role: 'assistant',
            status: 'completed',
        }

        expect(() =>
            buildIndexedDbFixturePayload({
                imageCacheEntries: [],
                snapshots: [createSnapshot('largest', [createTextMessage('user', 'user', 'text'), imageMessage, agentMessage])],
            })
        ).toThrow('缺少带本地缓存 Blob 的 image-result donor。')
    })

    it('rejects missing text and completed Agent Trace donors before it can produce a fixture payload', () => {
        const imageMessage: MindMessage = {
            createdAt: fixtureNow,
            id: 'image-message',
            parts: [
                {
                    contentPath: '/api/chat/runs/image-run/image',
                    expiresAt: '2099-01-01T00:00:00.000Z',
                    id: 'image-result',
                    runId: 'image-run',
                    suggestedFileName: 'image.png',
                    temporary: true,
                    type: 'image-result',
                },
            ],
            role: 'assistant',
            status: 'completed',
        }

        const cachedImage = {
            blob: new Blob(['image'], { type: 'image/png' }),
            byteLength: 5,
            conversationId: 'largest',
            createdAt: fixtureNow,
            lastAccessedAt: fixtureNow,
            mimeType: 'image/png' as const,
            runId: 'image-run',
        }

        expect(() =>
            buildIndexedDbFixturePayload({
                imageCacheEntries: [cachedImage],
                snapshots: [createSnapshot('largest', [imageMessage])],
            })
        ).toThrow('缺少包含文本的已完成消息 donor。')

        expect(() =>
            buildIndexedDbFixturePayload({
                imageCacheEntries: [cachedImage],
                snapshots: [createSnapshot('largest', [createTextMessage('text', 'assistant', 'text'), imageMessage])],
            })
        ).toThrow('缺少已完成 agent-step donor。')
    })

    it('does not copy Agent Interrupt messages into the read-only fixture', () => {
        const pendingInterrupt = {
            id: 'pending-interrupt',
            interruptId: 'interrupt-id',
            interruptKind: 'strategy_review',
            payload: {},
            runId: 'source-agent-run',
            status: 'pending',
            threadId: 'source-agent-thread',
            type: 'agent-interrupt',
        } as MindMessage['parts'][number]
        const primarySnapshot = createSnapshot('largest', [
            createTextMessage('text', 'assistant', 'text'),
            {
                createdAt: fixtureNow,
                id: 'interrupt-message',
                parts: [pendingInterrupt],
                role: 'assistant',
                status: 'completed',
            },
        ])
        const imageMessage: MindMessage = {
            createdAt: fixtureNow,
            id: 'image-message',
            parts: [
                {
                    contentPath: '/api/chat/runs/image-run/image',
                    expiresAt: '2099-01-01T00:00:00.000Z',
                    id: 'image-result',
                    runId: 'image-run',
                    suggestedFileName: 'image.png',
                    temporary: true,
                    type: 'image-result',
                },
            ],
            role: 'assistant',
            status: 'completed',
        }
        const agentMessage: MindMessage = {
            createdAt: fixtureNow,
            id: 'agent-message',
            parts: [
                {
                    agentName: 'Tasklist Agent',
                    graph: { nodes: [], routes: [], runtime: 'LangGraph' },
                    id: 'agent-step',
                    runId: 'agent-run',
                    status: 'completed',
                    type: 'agent-step',
                },
            ],
            role: 'assistant',
            status: 'completed',
        }

        const result = buildIndexedDbFixturePayload({
            imageCacheEntries: [
                {
                    blob: new Blob(['image'], { type: 'image/png' }),
                    byteLength: 5,
                    conversationId: 'image',
                    createdAt: fixtureNow,
                    lastAccessedAt: fixtureNow,
                    mimeType: 'image/png',
                    runId: 'image-run',
                },
            ],
            snapshots: [primarySnapshot, createSnapshot('image', [imageMessage]), createSnapshot('agent', [agentMessage])],
        })

        expect(result.sourceSummary.primarySourceMessageCount).toBe(1)
        expect(result.messages.flatMap(message => message.parts).some(part => part.type === 'agent-interrupt')).toBe(false)
    })

    it('limits cleanup targets to the fixture conversation, image cache and backup key', () => {
        expect(getIndexedDbFixtureCleanupTargets()).toEqual({
            backupStorageKey: 'ai-mind:v053-message-virtualization-fixture-backup',
            conversationId: 'v053-message-virtualization-fixture',
            imageRunId: 'v053-message-virtualization-fixture:image',
        })
    })
})
