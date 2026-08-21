/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    LOCAL_CHAT_RECENT_LIMIT,
    type LocalConversationMetadata,
    localConversationSnapshotSchema,
} from '@/components/instamind/local-chat-persistence/schema'
import { createLocalConversationSnapshot, projectRecoverableMessages } from '@/components/instamind/local-chat-persistence/stable-snapshot'
import {
    createIndexFromRegistry,
    deleteLocalConversationSnapshots,
    deleteLocalImageResultCaches,
    LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT,
    readLocalConversationIndex,
    readLocalConversationSnapshot,
    readLocalImageResultCache,
    reconcileLocalConversationIndex,
    writeLocalConversationIndex,
    writeLocalConversationSnapshot,
    writeLocalImageResultCache,
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
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('local chat persistence schema and projection', () => {
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
            schemaVersion: 1,
        })
        expect(localConversationSnapshotSchema.safeParse({ ...snapshot, rawGraphState: {} }).success).toBe(false)
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
})

describe('local chat persistence store', () => {
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
