/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildRequestMessages } from '@/components/instamind/chat-stream/request-message-builder'
import {
    LOCAL_CHAT_RECENT_LIMIT,
    type LocalConversationMetadata,
    localConversationSnapshotSchema,
    localMessageHeightHintRecordSchema,
} from '@/components/instamind/local-chat-persistence/schema'
import { createLocalConversationSnapshot, projectRecoverableMessages } from '@/components/instamind/local-chat-persistence/stable-snapshot'
import {
    createIndexFromRegistry,
    deleteLocalConversationSnapshots,
    deleteLocalImageResultCaches,
    deleteLocalMessageHeightHints,
    LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT,
    readLocalConversationIndex,
    readLocalConversationSnapshot,
    readLocalImageResultCache,
    readLocalMessageHeightHints,
    reconcileLocalConversationIndex,
    writeLocalConversationIndex,
    writeLocalConversationSnapshot,
    writeLocalImageResultCache,
    writeLocalMessageHeightHints,
} from '@/components/instamind/local-chat-persistence/store'
import type { MindMessage } from '@/lib/ai/types/message'

function createConversation(id: string, title = id): LocalConversationMetadata {
    return {
        createdAt: '2026-07-05T10:00:00.000Z',
        hasMessages: true,
        id,
        lastActiveAt: '2026-07-05T10:00:00.000Z',
        title,
    }
}

function createTextMessage(id: string, role: 'assistant' | 'user', text = id): MindMessage {
    return {
        createdAt: '2026-07-05T10:00:00.000Z',
        id,
        parts: [{ format: 'markdown', text, type: 'text' }],
        role,
        status: 'completed',
    }
}

function installFakeIndexedDB() {
    const stores = new Map<string, Map<string, unknown>>()
    const observations = {
        heightHintIndexLookups: [] as string[],
        heightHintStoreGetAllCalls: 0,
        reset() {
            this.heightHintIndexLookups.length = 0
            this.heightHintStoreGetAllCalls = 0
        },
    }

    class FakeObjectStore {
        constructor(
            private readonly name: string,
            private readonly transaction: FakeTransaction
        ) {}

        get(key: string) {
            const request = {} as IDBRequest<unknown>

            queueMicrotask(() => {
                Object.assign(request, { result: stores.get(this.name)?.get(key) })
                request.onsuccess?.(new Event('success') as Event & { target: IDBRequest<unknown> })
                this.transaction.complete()
            })

            return request
        }

        getAll() {
            const request = {} as IDBRequest<unknown[]>

            if (this.name === 'message-height-hints') {
                observations.heightHintStoreGetAllCalls += 1
            }

            queueMicrotask(() => {
                Object.assign(request, { result: Array.from(stores.get(this.name)?.values() ?? []) })
                request.onsuccess?.(new Event('success') as Event & { target: IDBRequest<unknown[]> })
                this.transaction.complete()
            })

            return request
        }

        put(value: unknown, key?: string) {
            const request = {} as IDBRequest<IDBValidKey>

            queueMicrotask(() => {
                const store = stores.get(this.name) ?? new Map<string, unknown>()
                const storeKey =
                    key ??
                    (this.name === 'image-results'
                        ? (value as { runId?: string }).runId
                        : this.name === 'message-height-hints'
                          ? (value as { key?: string }).key
                          : (value as { conversationId?: string }).conversationId)

                if (typeof storeKey === 'string') {
                    store.set(storeKey, value)
                    stores.set(this.name, store)
                }

                Object.assign(request, { result: storeKey })
                request.onsuccess?.(new Event('success') as Event & { target: IDBRequest<IDBValidKey> })
                this.transaction.complete()
            })

            return request
        }

        delete(key: string) {
            const request = {} as IDBRequest<undefined>

            queueMicrotask(() => {
                stores.get(this.name)?.delete(key)
                request.onsuccess?.(new Event('success') as Event & { target: IDBRequest<undefined> })
                this.transaction.complete()
            })

            return request
        }

        createIndex() {
            return {} as IDBIndex
        }

        index(name: string) {
            if (this.name !== 'message-height-hints' || name !== 'conversationId') {
                throw new Error(`Unsupported fake index: ${this.name}.${name}`)
            }

            return {
                getAll: (conversationId: IDBValidKey | IDBKeyRange | null | undefined) => {
                    const request = {} as IDBRequest<unknown[]>

                    if (typeof conversationId === 'string') {
                        observations.heightHintIndexLookups.push(conversationId)
                    }

                    queueMicrotask(() => {
                        const records = Array.from(stores.get(this.name)?.values() ?? []).filter(
                            record =>
                                typeof conversationId === 'string' &&
                                !!record &&
                                typeof record === 'object' &&
                                (record as { conversationId?: unknown }).conversationId === conversationId
                        )

                        Object.assign(request, { result: records })
                        request.onsuccess?.(new Event('success') as Event & { target: IDBRequest<unknown[]> })
                        this.transaction.complete()
                    })

                    return request
                },
            } as IDBIndex
        }
    }

    class FakeTransaction {
        onabort: ((event: Event) => void) | null = null
        oncomplete: ((event: Event) => void) | null = null
        onerror: ((event: Event) => void) | null = null
        error: DOMException | null = null
        private completed = false

        objectStore(name: string) {
            return new FakeObjectStore(name, this) as unknown as IDBObjectStore
        }

        complete() {
            if (this.completed) {
                return
            }

            this.completed = true
            queueMicrotask(() => this.oncomplete?.(new Event('complete')))
        }
    }

    class FakeDatabase {
        objectStoreNames = {
            contains: (name: string) => stores.has(name),
        } as DOMStringList

        close() {}

        createObjectStore(name: string) {
            stores.set(name, new Map())
            return new FakeObjectStore(name, new FakeTransaction()) as unknown as IDBObjectStore
        }

        transaction(name: string) {
            return new FakeTransaction() as unknown as IDBTransaction & { objectStore(name: string): IDBObjectStore }
        }
    }

    const database = new FakeDatabase()
    const indexedDB = {
        open: vi.fn(() => {
            const request = {} as IDBOpenDBRequest

            queueMicrotask(() => {
                Object.assign(request, { result: database })
                request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent)
                request.onsuccess?.(new Event('success') as Event & { target: IDBOpenDBRequest })
            })

            return request
        }),
    }

    vi.stubGlobal('indexedDB', indexedDB)
    Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: indexedDB,
    })

    return observations
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('local chat persistence schema and projection', () => {
    it('recovers completed agent-run and agent-graph parts while rejecting legacy agent-step snapshots', () => {
        const conversation = createConversation('conv-agent-parts')
        const graph = {
            nodes: [
                {
                    nodeId: 'readVersionPlan',
                    partId: 'graph-node-1',
                    patchSummaries: [],
                    status: 'completed' as const,
                    stepIndex: 1,
                    summary: '已读取版本方案。',
                    title: '读取版本方案',
                },
            ],
            routes: [],
            runtime: 'LangGraph' as const,
        }
        const snapshot = createLocalConversationSnapshot({
            conversation,
            messages: [
                createTextMessage('user-agent-parts', 'user', '继续'),
                {
                    ...createTextMessage('assistant-run', 'assistant', '通用回答'),
                    parts: [
                        { id: 'agent-run:run-1', runId: 'run-1', status: 'completed', type: 'agent-run' },
                        { format: 'markdown', text: '通用回答', type: 'text' },
                    ],
                },
                {
                    ...createTextMessage('assistant-graph', 'assistant', '任务清单回答'),
                    parts: [
                        {
                            agentName: 'version-plan-to-tasklist-agent',
                            graph,
                            id: 'agent-graph:graph-1',
                            runId: 'graph-1',
                            status: 'completed',
                            type: 'agent-graph',
                        },
                        { format: 'markdown', text: '任务清单回答', type: 'text' },
                    ],
                },
            ],
        })

        expect(snapshot?.messages.map(message => message.parts.map(part => part.type))).toEqual([
            ['text'],
            ['agent-run', 'text'],
            ['agent-graph', 'text'],
        ])
        expect(localConversationSnapshotSchema.safeParse(snapshot).success).toBe(true)
        expect(
            localConversationSnapshotSchema.safeParse({
                ...snapshot,
                messages: snapshot!.messages.map(message =>
                    message.id === 'assistant-graph'
                        ? {
                              ...message,
                              parts: message.parts.map(part => (part.type === 'agent-graph' ? { ...part, type: 'agent-step' } : part)),
                          }
                        : message
                ),
            }).success
        ).toBe(false)
    })

    it('drops completed-message snapshots whose General ReAct run is not completed', () => {
        const conversation = createConversation('conv-agent-terminal')
        const messages: MindMessage[] = ['running', 'cancelled', 'failed'].map(status => ({
            createdAt: conversation.createdAt,
            id: `assistant-${status}`,
            parts: [
                { runId: `run-${status}`, status: status as 'running' | 'cancelled' | 'failed', type: 'agent-run' },
                { format: 'markdown', text: `partial-${status}`, type: 'text' },
            ],
            role: 'assistant',
            status: 'completed',
        }))

        const snapshot = createLocalConversationSnapshot({
            conversation,
            messages: [createTextMessage('user-terminal', 'user', '问题'), ...messages],
        })

        expect(snapshot?.messages.map(message => message.id)).toEqual(['user-terminal'])
        expect(JSON.stringify(snapshot)).not.toContain('partial-')
    })

    it('保留已完成的 Agent commentary/final 与 provenance，并排除 pending 或 interrupted Agent text', () => {
        const conversation = createConversation('conv-agent-text-snapshot')
        const snapshot = createLocalConversationSnapshot({
            conversation,
            messages: [
                createTextMessage('user-agent-text', 'user', '请查询'),
                {
                    createdAt: conversation.createdAt,
                    id: 'assistant-agent-text',
                    parts: [
                        {
                            finalizationMode: 'constrained',
                            id: 'agent-run:run-agent-text',
                            runId: 'run-agent-text',
                            status: 'completed',
                            type: 'agent-run',
                        },
                        {
                            format: 'markdown',
                            id: 'agent-text:commentary',
                            modelTurnId: 'run-agent-text:1',
                            phase: 'commentary',
                            runId: 'run-agent-text',
                            status: 'completed',
                            text: '我先查询资料。',
                            type: 'agent-text',
                        },
                        {
                            format: 'markdown',
                            id: 'agent-text:final',
                            modelTurnId: 'run-agent-text:2',
                            phase: 'final_answer',
                            runId: 'run-agent-text',
                            status: 'completed',
                            text: '基于已完成的资料，结论如下。',
                            type: 'agent-text',
                        },
                        {
                            format: 'markdown',
                            id: 'agent-text:pending',
                            modelTurnId: 'run-agent-text:3',
                            phase: 'pending',
                            runId: 'run-agent-text',
                            status: 'streaming',
                            text: '不应快照',
                            type: 'agent-text',
                        },
                    ],
                    role: 'assistant',
                    status: 'completed',
                },
            ],
        })

        const assistant = snapshot?.messages.find(message => message.id === 'assistant-agent-text')

        expect(assistant?.parts).toEqual([
            expect.objectContaining({ finalizationMode: 'constrained', type: 'agent-run' }),
            expect.objectContaining({ phase: 'commentary', text: '我先查询资料。', type: 'agent-text' }),
            expect.objectContaining({ phase: 'final_answer', text: '基于已完成的资料，结论如下。', type: 'agent-text' }),
        ])
        expect(JSON.stringify(snapshot)).not.toContain('不应快照')
        expect(localConversationSnapshotSchema.safeParse(snapshot).success).toBe(true)
    })

    it('excludes cancelled, failed and streaming assistant text from the next request context', () => {
        const messages: MindMessage[] = [
            createTextMessage('user-before', 'user', '上一问'),
            createTextMessage('assistant-completed', 'assistant', '稳定回答'),
            { ...createTextMessage('assistant-cancelled', 'assistant', '取消半截'), status: 'cancelled' },
            { ...createTextMessage('assistant-failed', 'assistant', '失败半截'), status: 'failed' },
            { ...createTextMessage('assistant-streaming', 'assistant', '流式半截'), status: 'streaming' },
            createTextMessage('user-current', 'user', '下一问'),
        ]

        const requestMessages = buildRequestMessages(messages)

        expect(requestMessages.map(message => message.parts.map(part => part.text).join(''))).toEqual(['上一问', '稳定回答', '下一问'])
    })

    it('同会话 follow-up 只携带 completed Agent final，不携带 commentary 或 pending', () => {
        const messages: MindMessage[] = [
            createTextMessage('user-agent-followup', 'user', '先查询'),
            {
                createdAt: '2026-08-30T10:00:00.000Z',
                id: 'assistant-agent-followup',
                parts: [
                    {
                        format: 'markdown',
                        id: 'commentary',
                        modelTurnId: 'turn-1',
                        phase: 'commentary',
                        runId: 'run-followup',
                        status: 'completed',
                        text: '我先查资料。',
                        type: 'agent-text',
                    },
                    {
                        format: 'markdown',
                        id: 'final',
                        modelTurnId: 'turn-2',
                        phase: 'final_answer',
                        runId: 'run-followup',
                        status: 'completed',
                        text: '这是带限制说明的受限结果。',
                        type: 'agent-text',
                    },
                    {
                        format: 'markdown',
                        id: 'pending',
                        modelTurnId: 'turn-3',
                        phase: 'pending',
                        runId: 'run-followup',
                        status: 'streaming',
                        text: '不得进入下轮',
                        type: 'agent-text',
                    },
                ],
                role: 'assistant',
                status: 'completed',
            },
            createTextMessage('user-agent-followup-next', 'user', '继续问'),
        ]

        expect(buildRequestMessages(messages).map(message => message.parts.map(part => part.text).join(''))).toEqual([
            '先查询',
            '这是带限制说明的受限结果。',
            '继续问',
        ])
    })

    it('projects completed generic Trace parts through the public allowlist', () => {
        const conversation = createConversation('conv-trace')
        const snapshot = createLocalConversationSnapshot({
            conversation,
            messages: [
                createTextMessage('user-trace', 'user', '查一下 React'),
                {
                    createdAt: conversation.createdAt,
                    id: 'assistant-trace',
                    parts: [
                        {
                            error: 'provider-secret-error',
                            id: 'tool-1',
                            input: '{"apiKey":"secret"}',
                            output: '网页正文和内部观察',
                            sources: [
                                {
                                    originTool: 'read-url',
                                    sourceId: 'source-1',
                                    status: 'read',
                                    title: 'React',
                                    url: 'https://example.com/react',
                                },
                            ],
                            status: 'completed',
                            title: '读取页面',
                            toolName: 'read-url',
                            type: 'tool',
                        },
                        {
                            id: 'prompt-1',
                            input: 'raw internal prompt',
                            messageCount: 1,
                            promptName: 'research',
                            status: 'completed',
                            type: 'prompt',
                        },
                        {
                            id: 'reasoning-1',
                            format: 'markdown',
                            text: 'private chain of thought',
                            type: 'reasoning',
                        },
                        {
                            contentPreview: 'raw page body',
                            id: 'resource-1',
                            resourceName: 'React',
                            serverId: 'web',
                            status: 'completed',
                            type: 'resource',
                            uri: 'https://example.com/react',
                        },
                        {
                            format: 'markdown',
                            id: 'text-1',
                            text: '最终回答',
                            type: 'text',
                        },
                    ],
                    role: 'assistant',
                    status: 'completed',
                },
            ],
        })

        expect(snapshot).not.toBeNull()
        const serialized = JSON.stringify(snapshot)

        expect(serialized).not.toContain('secret')
        expect(serialized).not.toContain('private chain of thought')
        expect(serialized).not.toContain('raw page body')
        expect(serialized).not.toContain('raw internal prompt')
        expect(serialized).not.toContain('provider-secret-error')
        expect(snapshot?.messages.find(message => message.id === 'assistant-trace')?.parts.map(part => part.type)).toEqual([
            'tool',
            'prompt',
            'resource',
            'text',
        ])
    })

    it('does not persist cancelled, failed, or partial assistant turns', () => {
        const conversation = createConversation('conv-partial')
        const snapshot = createLocalConversationSnapshot({
            conversation,
            messages: [
                createTextMessage('user-partial', 'user', '未完成问题'),
                {
                    createdAt: conversation.createdAt,
                    id: 'assistant-partial',
                    parts: [{ format: 'markdown', text: '半截', type: 'text' }],
                    role: 'assistant',
                    status: 'streaming',
                },
            ],
        })

        expect(snapshot?.messages.map(message => message.id)).toEqual(['user-partial'])
    })
    it('keeps rich stable UI parts and filters transient control state', () => {
        const messages: MindMessage[] = [
            createTextMessage('user-1', 'user', '问题'),
            {
                ...createTextMessage('assistant-1', 'assistant', '回答'),
                artifacts: [
                    {
                        artifactId: 'artifact-1',
                        artifactKind: 'plan',
                        artifactType: 'text',
                        content: '完成内容',
                        format: 'markdown',
                        status: 'completed',
                        title: '交付物',
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
                    { format: 'markdown', text: '回答', type: 'text' },
                    { message: 'memory', status: 'started', type: 'thread-memory-status' },
                    { name: 'Reader', skillId: 'reader', type: 'skill' },
                ],
            },
            {
                ...createTextMessage('assistant-streaming', 'assistant', '半截'),
                status: 'streaming',
            },
        ]

        const recoverableMessages = projectRecoverableMessages(messages)

        expect(recoverableMessages.map(message => message.id)).toEqual(['user-1', 'assistant-1'])
        expect(recoverableMessages[1]?.parts.map(part => part.type)).toEqual(['text', 'skill'])
        expect(recoverableMessages[1]?.artifacts?.map(artifact => artifact.artifactId)).toEqual(['artifact-1'])
    })

    it('uses an explicit strict message and artifact allowlist for local snapshots', () => {
        const messages: MindMessage[] = [
            {
                ...createTextMessage('assistant-public-only', 'assistant', '稳定回答'),
                artifacts: [
                    {
                        artifactId: 'artifact-public-only',
                        artifactKind: 'plan',
                        artifactType: 'text',
                        content: '公开交付内容',
                        format: 'markdown',
                        internalArtifactSentinel: 'must-not-persist',
                        status: 'completed',
                        title: '交付物',
                    } as MindMessage['artifacts'][number],
                ],
                internalMessageSentinel: 'must-not-persist',
            } as MindMessage,
        ]

        const snapshot = createLocalConversationSnapshot({ conversation: createConversation('conv-public-only'), messages })

        expect(snapshot).not.toBeNull()
        expect(JSON.stringify(snapshot)).not.toContain('must-not-persist')
        expect(Object.keys(snapshot!.messages[0]!).sort()).toEqual(['artifacts', 'createdAt', 'id', 'parts', 'role', 'status'])
        expect(localConversationSnapshotSchema.safeParse({ ...snapshot!.messages[0], internalMessageSentinel: true }).success).toBe(false)
        expect(
            localConversationSnapshotSchema.safeParse({
                ...snapshot,
                messages: [
                    {
                        ...snapshot!.messages[0],
                        artifacts: [{ ...snapshot!.messages[0]!.artifacts![0], internalArtifactSentinel: true }],
                    },
                ],
            }).success
        ).toBe(false)
    })

    it('does not retain private, credential-bearing, or signed resource and source URLs', () => {
        const snapshot = createLocalConversationSnapshot({
            conversation: createConversation('conv-safe-links'),
            messages: [
                {
                    ...createTextMessage('assistant-safe-links', 'assistant', '稳定回答'),
                    parts: [
                        {
                            id: 'tool-private-source',
                            input: '{}',
                            sources: [
                                {
                                    originTool: 'read-url',
                                    sourceId: 'private-source',
                                    status: 'read',
                                    title: 'Private',
                                    url: 'https://user:password@example.com/private',
                                },
                                {
                                    originTool: 'web-search',
                                    sourceId: 'signed-source',
                                    status: 'discovered',
                                    title: 'Signed',
                                    url: 'https://example.com/file?X-Amz-Signature=secret',
                                },
                            ],
                            status: 'completed',
                            toolName: 'read-url',
                            type: 'tool',
                        },
                        {
                            id: 'resource-private-uri',
                            resourceName: 'Private resource',
                            serverId: 'web',
                            status: 'completed',
                            type: 'resource',
                            uri: 'http://127.0.0.1/metadata',
                        },
                        { format: 'markdown', text: '稳定回答', type: 'text' },
                    ],
                },
            ],
        })

        expect(snapshot).not.toBeNull()
        expect(JSON.stringify(snapshot)).not.toContain('user:password')
        expect(JSON.stringify(snapshot)).not.toContain('X-Amz-Signature')
        expect(JSON.stringify(snapshot)).not.toContain('127.0.0.1')
    })

    it('persists only discovered or read public sources', () => {
        const snapshot = createLocalConversationSnapshot({
            conversation: createConversation('conv-source-status'),
            messages: [
                {
                    ...createTextMessage('assistant-source-status', 'assistant', '稳定回答'),
                    parts: [
                        {
                            id: 'tool-source-status',
                            input: '{}',
                            sources: [
                                {
                                    originTool: 'web-search',
                                    sourceId: 'discovered-source',
                                    status: 'discovered',
                                    title: 'Discovered',
                                    url: 'https://example.com/discovered',
                                },
                                {
                                    originTool: 'web-search',
                                    sourceId: 'unavailable-source',
                                    status: 'unavailable',
                                    title: 'Unavailable',
                                    url: 'https://example.com/unavailable',
                                },
                            ],
                            status: 'completed',
                            toolName: 'web-search',
                            type: 'tool',
                        },
                        { format: 'markdown', text: '稳定回答', type: 'text' },
                    ],
                },
            ],
        })

        const toolPart = snapshot?.messages[0]?.parts.find(part => part.type === 'tool')

        expect(toolPart).toMatchObject({
            sources: [
                {
                    sourceId: 'discovered-source',
                    status: 'discovered',
                },
            ],
        })
    })

    it('creates a versioned snapshot and rejects forbidden raw fields during validation', () => {
        const snapshot = createLocalConversationSnapshot({
            conversation: createConversation('conv-a', 'Conversation A'),
            messages: [createTextMessage('user-1', 'user')],
            previousRevision: 4,
            snapshotAt: '2026-07-05T11:00:00.000Z',
        })

        expect(snapshot).toMatchObject({
            conversationId: 'conv-a',
            revision: 5,
            schemaVersion: 2,
        })
        expect(localConversationSnapshotSchema.safeParse({ ...snapshot, rawGraphState: {} }).success).toBe(false)
        expect(
            localConversationSnapshotSchema.safeParse({
                ...snapshot,
                messages: [
                    {
                        ...snapshot!.messages[0],
                        parts: [{ input: 'secret', status: 'completed', toolName: 'read-url', type: 'tool' }],
                    },
                ],
            }).success
        ).toBe(false)
    })

    it('persists public image metadata but rejects Blob and object URL injection', () => {
        const messages: MindMessage[] = [
            createTextMessage('user-1', 'user', 'Generate an image'),
            {
                createdAt: '2026-07-05T10:00:01.000Z',
                id: 'assistant-image',
                parts: [
                    {
                        id: 'image-brief-run-1',
                        runId: 'run-1',
                        summary: {
                            assumptions: [],
                            avoid: [],
                            intent: 'A calm landscape',
                            mustInclude: ['lake'],
                            subjects: ['lake'],
                        },
                        type: 'image-brief',
                    },
                    {
                        contentPath: '/api/chat/runs/run-1/image',
                        expiresAt: '2026-07-05T10:10:00.000Z',
                        id: 'image-result-run-1',
                        runId: 'run-1',
                        suggestedFileName: 'ai-mind-image-run-1.jpg',
                        temporary: true,
                        type: 'image-result',
                    },
                ],
                role: 'assistant',
                status: 'completed',
            },
        ]
        const snapshot = createLocalConversationSnapshot({
            conversation: createConversation('conv-image'),
            messages,
            snapshotAt: '2026-07-05T10:00:02.000Z',
        })

        expect(snapshot?.messages.map(message => message.id)).toEqual(['user-1', 'assistant-image'])
        expect(snapshot?.messages[1]?.parts.map(part => part.type)).toEqual(['image-brief', 'image-result'])
        expect(
            localConversationSnapshotSchema.safeParse({
                ...snapshot,
                messages: [
                    {
                        ...snapshot?.messages[1],
                        parts: [
                            {
                                contentPath: '/api/chat/runs/run-1/image',
                                expiresAt: '2026-07-05T10:10:00.000Z',
                                id: 'image-result-run-1',
                                objectUrl: 'blob:private-image',
                                runId: 'run-1',
                                suggestedFileName: 'ai-mind-image-run-1.jpg',
                                temporary: true,
                                type: 'image-result',
                            },
                        ],
                    },
                ],
            }).success
        ).toBe(false)
    })

    it('round-trips completed workflow progress with its disclosure presentation state', () => {
        const snapshot = createLocalConversationSnapshot({
            conversation: createConversation('conv-workflow'),
            messages: [
                createTextMessage('user-workflow', 'user', '生成图片'),
                {
                    createdAt: '2026-07-05T10:00:01.000Z',
                    id: 'assistant-workflow',
                    parts: [
                        {
                            durationMs: 1_200,
                            id: 'workflow-1',
                            status: 'completed',
                            steps: [
                                {
                                    details: ['已完成'],
                                    endedAt: 1_200,
                                    id: 'step-1',
                                    startedAt: 0,
                                    status: 'completed',
                                    title: '生成',
                                },
                            ],
                            title: '图片生成',
                            type: 'workflow-progress',
                            visibility: 'collapsed',
                            workflowId: 'image-generation-run-1',
                            workflowKind: 'image_generation',
                        },
                        { format: 'markdown', text: '图片已生成', type: 'text' },
                    ],
                    role: 'assistant',
                    status: 'completed',
                },
            ],
        })

        expect(snapshot).not.toBeNull()
        expect(localConversationSnapshotSchema.safeParse(snapshot).success).toBe(true)
        expect(snapshot?.messages[1]?.parts[0]).toMatchObject({ type: 'workflow-progress', visibility: 'collapsed' })
    })

    it('accepts opaque normalized message height hint entries without a content-size ceiling', () => {
        const record = {
            conversationId: 'conv-height-hints',
            entries: [
                {
                    height: 248.25,
                    measuredAt: '2026-08-30T10:00:00.000Z',
                    messageId: 'message-1',
                    presentation: 'history-default',
                    renderFingerprint: 'fnv1a-abc123',
                },
            ],
            geometryVersion: 1,
            key: 'conv-height-hints::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:00.000Z',
        }

        expect(localMessageHeightHintRecordSchema.safeParse(record).success).toBe(true)
        expect(
            localMessageHeightHintRecordSchema.safeParse({
                ...record,
                entries: [{ ...record.entries[0], height: 12_345.5 }],
            }).success
        ).toBe(true)
        expect(
            localMessageHeightHintRecordSchema.safeParse({
                ...record,
                entries: [{ ...record.entries[0], content: '不得存储消息正文' }],
            }).success
        ).toBe(false)
    })
})

describe('local chat persistence store', () => {
    it('reads only an exact conversation and layout height hint record', async () => {
        installFakeIndexedDB()

        await expect(
            writeLocalMessageHeightHints({
                conversationId: 'conv-height-hints',
                entries: [
                    {
                        height: 248.25,
                        measuredAt: '2026-08-30T10:00:00.000Z',
                        messageId: 'message-1',
                        presentation: 'history-default',
                        renderFingerprint: 'fnv1a-abc123',
                    },
                ],
                geometryVersion: 1,
                key: 'conv-height-hints::g1|w856|r1|history-default',
                layoutKey: 'g1|w856|r1|history-default',
                messageColumnWidth: 856,
                updatedAt: '2026-08-30T10:00:00.000Z',
            })
        ).resolves.toEqual({ status: 'written' })

        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w856|r1|history-default')).resolves.toMatchObject({
            data: {
                entries: [expect.objectContaining({ height: 248.25, messageId: 'message-1' })],
            },
            status: 'valid',
        })
        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w720|r1|history-default')).resolves.toEqual({ status: 'missing' })
        await expect(readLocalMessageHeightHints('other-conversation', 'g1|w856|r1|history-default')).resolves.toEqual({
            status: 'missing',
        })
    })

    it('uses the conversation index when retaining height-hint layouts', async () => {
        const observations = installFakeIndexedDB()

        await writeLocalMessageHeightHints({
            conversationId: 'conv-unrelated-hints',
            entries: [],
            geometryVersion: 1,
            key: 'conv-unrelated-hints::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:00.000Z',
        })
        observations.reset()

        for (let index = 0; index < 4; index += 1) {
            const layoutKey = `g1|w${720 + index * 80}|r1|history-default`

            await writeLocalMessageHeightHints({
                conversationId: 'conv-height-hints',
                entries: [],
                geometryVersion: 1,
                key: `conv-height-hints::${layoutKey}`,
                layoutKey,
                messageColumnWidth: 720 + index * 80,
                updatedAt: `2026-08-30T10:00:0${index}.000Z`,
            })
        }

        expect(observations.heightHintStoreGetAllCalls).toBe(0)
        expect(observations.heightHintIndexLookups).toEqual([
            'conv-height-hints',
            'conv-height-hints',
            'conv-height-hints',
            'conv-height-hints',
        ])
        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w720|r1|history-default')).resolves.toEqual({
            status: 'missing',
        })
        await expect(readLocalMessageHeightHints('conv-unrelated-hints', 'g1|w856|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })
    })

    it('uses the conversation index when clearing deleted height-hint layouts', async () => {
        const observations = installFakeIndexedDB()

        await writeLocalMessageHeightHints({
            conversationId: 'conv-delete-hints',
            entries: [],
            geometryVersion: 1,
            key: 'conv-delete-hints::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:00.000Z',
        })
        await writeLocalMessageHeightHints({
            conversationId: 'conv-retain-hints',
            entries: [],
            geometryVersion: 1,
            key: 'conv-retain-hints::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:01.000Z',
        })
        observations.reset()

        await deleteLocalMessageHeightHints(['conv-delete-hints'])

        expect(observations.heightHintStoreGetAllCalls).toBe(0)
        expect(observations.heightHintIndexLookups).toEqual(['conv-delete-hints'])
        await expect(readLocalMessageHeightHints('conv-delete-hints', 'g1|w856|r1|history-default')).resolves.toEqual({
            status: 'missing',
        })
        await expect(readLocalMessageHeightHints('conv-retain-hints', 'g1|w856|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })
    })

    it('retains at most three height-hint layouts per conversation and cleans only deleted conversations', async () => {
        installFakeIndexedDB()

        for (let index = 0; index < 4; index += 1) {
            const layoutKey = `g1|w${720 + index * 80}|r1|history-default`
            await expect(
                writeLocalMessageHeightHints({
                    conversationId: 'conv-height-hints',
                    entries: [],
                    geometryVersion: 1,
                    key: `conv-height-hints::${layoutKey}`,
                    layoutKey,
                    messageColumnWidth: 720 + index * 80,
                    updatedAt: `2026-08-30T10:00:0${index}.000Z`,
                })
            ).resolves.toEqual({ status: 'written' })
        }
        await writeLocalMessageHeightHints({
            conversationId: 'conv-retain-hints',
            entries: [],
            geometryVersion: 1,
            key: 'conv-retain-hints::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:09.000Z',
        })

        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w720|r1|history-default')).resolves.toEqual({ status: 'missing' })
        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w800|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })
        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w960|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })

        await deleteLocalMessageHeightHints(['conv-height-hints'])

        await expect(readLocalMessageHeightHints('conv-height-hints', 'g1|w800|r1|history-default')).resolves.toEqual({ status: 'missing' })
        await expect(readLocalMessageHeightHints('conv-retain-hints', 'g1|w856|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })
    })

    it('does not let a pending height-hint write recreate cache after its conversation is deleted', async () => {
        installFakeIndexedDB()

        const pendingWrite = writeLocalMessageHeightHints({
            conversationId: 'conv-deleted-during-write',
            entries: [],
            geometryVersion: 1,
            key: 'conv-deleted-during-write::g1|w856|r1|history-default',
            layoutKey: 'g1|w856|r1|history-default',
            messageColumnWidth: 856,
            updatedAt: '2026-08-30T10:00:00.000Z',
        })

        await deleteLocalMessageHeightHints(['conv-deleted-during-write'])
        await pendingWrite

        await expect(readLocalMessageHeightHints('conv-deleted-during-write', 'g1|w856|r1|history-default')).resolves.toEqual({
            status: 'missing',
        })
    })

    it('allows a new height-hint generation to write when the same conversation id re-enters', async () => {
        installFakeIndexedDB()

        await deleteLocalMessageHeightHints(['conv-reentered'])

        await expect(
            writeLocalMessageHeightHints({
                conversationId: 'conv-reentered',
                entries: [],
                geometryVersion: 1,
                key: 'conv-reentered::g1|w856|r1|history-default',
                layoutKey: 'g1|w856|r1|history-default',
                messageColumnWidth: 856,
                updatedAt: '2026-08-30T10:00:00.000Z',
            })
        ).resolves.toEqual({ status: 'written' })

        await expect(readLocalMessageHeightHints('conv-reentered', 'g1|w856|r1|history-default')).resolves.toMatchObject({
            status: 'valid',
        })
    })

    it('returns unavailable when the browser blocks an IndexedDB upgrade', async () => {
        const request = {} as IDBOpenDBRequest
        const indexedDB = {
            open: vi.fn(() => request),
        }

        vi.stubGlobal('indexedDB', indexedDB)
        Object.defineProperty(window, 'indexedDB', {
            configurable: true,
            value: indexedDB,
        })

        const resultPromise = readLocalMessageHeightHints('conv-blocked', 'g1|w856|r1|history-default')

        expect(request.onblocked).toBeTypeOf('function')
        request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)

        await expect(resultPromise).resolves.toEqual({ status: 'unavailable' })
    })

    it('writes and reads the local index without losing different conversations', async () => {
        installFakeIndexedDB()

        const indexA = createIndexFromRegistry({
            conversations: [createConversation('conv-a')],
            isDraft: false,
            selectedConversationId: 'conv-a',
        })
        const indexB = createIndexFromRegistry({
            conversations: [createConversation('conv-b')],
            isDraft: false,
            previousRevision: indexA.revision,
            selectedConversationId: 'conv-b',
        })

        await expect(writeLocalConversationIndex(indexA)).resolves.toMatchObject({ status: 'written' })
        await expect(writeLocalConversationIndex(indexB)).resolves.toMatchObject({ status: 'written' })

        const result = await readLocalConversationIndex()

        expect(result.status).toBe('valid')
        expect(result.status === 'valid' ? result.data.selectedConversationId : null).toBe('conv-b')
        expect(result.status === 'valid' ? result.data.conversations.map(conversation => conversation.id).sort() : []).toEqual([
            'conv-a',
            'conv-b',
        ])
    })

    it('keeps up to fifty recent conversations while remaining compatible with ten-entry local indexes', async () => {
        installFakeIndexedDB()

        const legacyIndex = createIndexFromRegistry({
            conversations: Array.from({ length: 10 }, (_, index) => createConversation(`conv-legacy-${index}`)),
            isDraft: false,
            selectedConversationId: 'conv-legacy-0',
        })
        const recentIndex = createIndexFromRegistry({
            conversations: Array.from({ length: LOCAL_CHAT_RECENT_LIMIT + 1 }, (_, index) => {
                const timestamp = `2026-07-05T10:${(LOCAL_CHAT_RECENT_LIMIT - index).toString().padStart(2, '0')}:00.000Z`

                return {
                    ...createConversation(`conv-${LOCAL_CHAT_RECENT_LIMIT - index}`),
                    createdAt: timestamp,
                    lastActiveAt: timestamp,
                }
            }),
            isDraft: false,
            previousRevision: legacyIndex.revision,
            selectedConversationId: `conv-${LOCAL_CHAT_RECENT_LIMIT}`,
        })

        await expect(writeLocalConversationIndex(legacyIndex)).resolves.toMatchObject({ status: 'written' })
        await expect(readLocalConversationIndex()).resolves.toMatchObject({
            data: expect.objectContaining({ conversations: expect.arrayContaining([expect.objectContaining({ id: 'conv-legacy-0' })]) }),
            status: 'valid',
        })
        await expect(writeLocalConversationIndex(recentIndex)).resolves.toMatchObject({ status: 'written' })

        const result = await readLocalConversationIndex()

        expect(result.status === 'valid' ? result.data.conversations : []).toHaveLength(LOCAL_CHAT_RECENT_LIMIT)
        expect(result.status === 'valid' ? result.data.conversations.map(conversation => conversation.id) : []).toEqual(
            Array.from({ length: LOCAL_CHAT_RECENT_LIMIT }, (_, index) => `conv-${LOCAL_CHAT_RECENT_LIMIT - index}`)
        )
    })

    it('stores image Blobs independently and evicts the least recently used result at the count limit', async () => {
        installFakeIndexedDB()

        for (let index = 0; index <= LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT; index += 1) {
            await expect(
                writeLocalImageResultCache({
                    blob: new Blob([String(index)], { type: 'image/jpeg' }),
                    conversationId: 'conv-images',
                    mimeType: 'image/jpeg',
                    runId: `run-${index}`,
                })
            ).resolves.toEqual({ status: 'written' })
        }

        await expect(readLocalImageResultCache('run-0')).resolves.toEqual({ status: 'missing' })
        await expect(readLocalImageResultCache(`run-${LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT}`)).resolves.toMatchObject({
            data: {
                conversationId: 'conv-images',
                mimeType: 'image/jpeg',
                runId: `run-${LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT}`,
            },
            status: 'valid',
        })
    })

    it('removes cached image results when their confirmed conversation is deleted', async () => {
        installFakeIndexedDB()

        await writeLocalImageResultCache({
            blob: new Blob(['first'], { type: 'image/png' }),
            conversationId: 'conv-delete',
            mimeType: 'image/png',
            runId: 'run-delete',
        })
        await writeLocalImageResultCache({
            blob: new Blob(['second'], { type: 'image/png' }),
            conversationId: 'conv-retain',
            mimeType: 'image/png',
            runId: 'run-retain',
        })

        await deleteLocalImageResultCaches(['conv-delete'])

        await expect(readLocalImageResultCache('run-delete')).resolves.toEqual({ status: 'missing' })
        await expect(readLocalImageResultCache('run-retain')).resolves.toMatchObject({ status: 'valid' })
    })

    it('keeps newer same-conversation snapshots and rejects stale writes', async () => {
        installFakeIndexedDB()

        const conversation = createConversation('conv-a')
        const firstSnapshot = createLocalConversationSnapshot({
            conversation,
            messages: [createTextMessage('user-old', 'user')],
            previousRevision: 0,
        })
        const nextSnapshot = createLocalConversationSnapshot({
            conversation,
            messages: [createTextMessage('user-new', 'user')],
            previousRevision: 1,
        })

        expect(firstSnapshot).toBeTruthy()
        expect(nextSnapshot).toBeTruthy()

        await expect(writeLocalConversationSnapshot(nextSnapshot!)).resolves.toMatchObject({ status: 'written' })
        await expect(writeLocalConversationSnapshot(firstSnapshot!)).resolves.toMatchObject({ status: 'stale' })

        const result = await readLocalConversationSnapshot('conv-a')

        expect(result.status).toBe('valid')
        expect(result.status === 'valid' ? result.data.messages[0]?.id : null).toBe('user-new')
    })

    it('replaces the observed index from the server and deletes only baseline local-only snapshots', async () => {
        installFakeIndexedDB()

        const localOnlyConversation = createConversation('conv-local-only', 'Old local conversation')
        const retainedConversation = createConversation('conv-retained', 'Old title')
        const baseline = createIndexFromRegistry({
            conversations: [localOnlyConversation, retainedConversation],
            isDraft: false,
            selectedConversationId: retainedConversation.id,
        })
        const retainedSnapshot = createLocalConversationSnapshot({
            conversation: retainedConversation,
            messages: [createTextMessage('retained-message', 'assistant')],
            previousRevision: 0,
        })
        const localOnlySnapshot = createLocalConversationSnapshot({
            conversation: localOnlyConversation,
            messages: [createTextMessage('local-only-message', 'assistant')],
            previousRevision: 0,
        })

        await writeLocalConversationIndex(baseline)
        await writeLocalConversationSnapshot(retainedSnapshot)
        await writeLocalConversationSnapshot(localOnlySnapshot)

        const serverConversation = { ...retainedConversation, title: 'Server title' }
        const serverIndex = createIndexFromRegistry({
            conversations: [serverConversation],
            isDraft: false,
            previousRevision: baseline.revision,
            selectedConversationId: serverConversation.id,
        })

        await expect(reconcileLocalConversationIndex(serverIndex, baseline)).resolves.toMatchObject({ status: 'written' })
        await deleteLocalConversationSnapshots(['conv-local-only'])

        const indexResult = await readLocalConversationIndex()
        const retainedResult = await readLocalConversationSnapshot('conv-retained')
        const localOnlyResult = await readLocalConversationSnapshot('conv-local-only')

        expect(indexResult.status === 'valid' ? indexResult.data.conversations : []).toEqual([serverConversation])
        expect(retainedResult.status === 'valid' ? retainedResult.data.messages[0]?.id : null).toBe('retained-message')
        expect(localOnlyResult.status).toBe('missing')
    })

    it('preserves a different conversation created after the reconciliation baseline', async () => {
        installFakeIndexedDB()

        const baselineConversation = createConversation('conv-baseline')
        const concurrentConversation = createConversation('conv-concurrent')
        const baseline = createIndexFromRegistry({
            conversations: [baselineConversation],
            isDraft: false,
            selectedConversationId: baselineConversation.id,
        })
        const concurrentIndex = createIndexFromRegistry({
            conversations: [baselineConversation, concurrentConversation],
            isDraft: false,
            previousRevision: baseline.revision,
            selectedConversationId: concurrentConversation.id,
        })
        const serverIndex = createIndexFromRegistry({
            conversations: [],
            isDraft: true,
            previousRevision: concurrentIndex.revision,
            selectedConversationId: null,
        })

        await writeLocalConversationIndex(concurrentIndex)
        await expect(reconcileLocalConversationIndex(serverIndex, baseline)).resolves.toMatchObject({ status: 'written' })

        const result = await readLocalConversationIndex()

        expect(result.status === 'valid' ? result.data.conversations.map(conversation => conversation.id) : []).toEqual([
            concurrentConversation.id,
        ])
    })
})
