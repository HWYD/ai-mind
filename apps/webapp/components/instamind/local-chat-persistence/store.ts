import {
    LOCAL_CHAT_RECENT_LIMIT,
    LOCAL_CHAT_SCHEMA_VERSION,
    type LocalConversationIndex,
    localConversationIndexSchema,
    type LocalConversationMetadata,
    type LocalConversationSnapshot,
    localConversationSnapshotSchema,
    type LocalReadResult,
    type LocalWriteResult,
    normalizeLocalConversationIndex,
} from './schema'

const DATABASE_NAME = 'ai-mind-local-chat'
const DATABASE_VERSION = 2
const INDEX_STORE = 'conversation-index'
const SNAPSHOT_STORE = 'conversation-snapshots'
const IMAGE_RESULT_STORE = 'image-results'
const INDEX_KEY = 'current'

export const LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT = 30
export const LOCAL_IMAGE_RESULT_CACHE_MAX_BYTES = 100 * 1024 * 1024

export interface LocalImageResultCacheEntry {
    blob: Blob
    byteLength: number
    conversationId?: string
    createdAt: string
    lastAccessedAt: string
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
    runId: string
}

export type LocalImageResultReadResult =
    | {
          data: LocalImageResultCacheEntry
          status: 'valid'
      }
    | {
          status: 'missing' | 'invalid' | 'unavailable'
      }

export type LocalImageResultWriteResult = {
    status: 'written' | 'quota' | 'unavailable'
}

function getIndexedDBFactory() {
    return typeof window === 'undefined' ? null : window.indexedDB
}

function isQuotaError(error: unknown) {
    return error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
}

function openDatabase(): Promise<IDBDatabase> {
    const factory = getIndexedDBFactory()

    if (!factory) {
        return Promise.reject(new Error('IndexedDB is unavailable.'))
    }

    return new Promise((resolve, reject) => {
        const request = factory.open(DATABASE_NAME, DATABASE_VERSION)

        request.onupgradeneeded = () => {
            const database = request.result

            if (!database.objectStoreNames.contains(INDEX_STORE)) {
                database.createObjectStore(INDEX_STORE)
            }

            if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
                database.createObjectStore(SNAPSHOT_STORE, {
                    keyPath: 'conversationId',
                })
            }

            if (!database.objectStoreNames.contains(IMAGE_RESULT_STORE)) {
                database.createObjectStore(IMAGE_RESULT_STORE, {
                    keyPath: 'runId',
                })
            }
        }
        request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
        request.onsuccess = () => resolve(request.result)
    })
}

function runStoreOperation<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
    return openDatabase().then(
        database =>
            new Promise((resolve, reject) => {
                const transaction = database.transaction(storeName, mode)
                const store = transaction.objectStore(storeName)
                const request = operation(store)
                let requestResult: T | undefined

                if (request) {
                    request.onsuccess = () => {
                        requestResult = request.result
                    }
                    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
                }

                transaction.oncomplete = () => {
                    database.close()
                    resolve(requestResult)
                }
                transaction.onerror = () => {
                    database.close()
                    reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
                }
                transaction.onabort = () => {
                    database.close()
                    reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
                }
            })
    )
}

export async function readLocalConversationIndex(): Promise<LocalReadResult<LocalConversationIndex>> {
    try {
        const value = await runStoreOperation<unknown>(INDEX_STORE, 'readonly', store => store.get(INDEX_KEY))

        if (!value) {
            return { status: 'missing' }
        }

        const parsed = localConversationIndexSchema.safeParse(value)

        if (!parsed.success) {
            return { status: 'invalid' }
        }

        return {
            data: normalizeLocalConversationIndex(parsed.data),
            status: 'valid',
        }
    } catch {
        return { status: 'unavailable' }
    }
}

export async function writeLocalConversationIndex(nextIndex: LocalConversationIndex): Promise<LocalWriteResult> {
    try {
        const current = await readLocalConversationIndex()
        const normalizedIndex = normalizeLocalConversationIndex(
            current.status === 'valid'
                ? {
                      ...nextIndex,
                      conversations: [...current.data.conversations, ...nextIndex.conversations],
                  }
                : nextIndex
        )

        if (current.status === 'valid' && current.data.revision > normalizedIndex.revision) {
            return { status: 'stale' }
        }

        await runStoreOperation(INDEX_STORE, 'readwrite', store => store.put(normalizedIndex, INDEX_KEY))
        return {
            revision: normalizedIndex.revision,
            status: 'written',
        }
    } catch (error) {
        return { status: isQuotaError(error) ? 'quota' : 'unavailable' }
    }
}

export type LocalConversationIndexBaseline = Pick<LocalConversationIndex, 'conversations' | 'revision'>

export async function reconcileLocalConversationIndex(
    nextIndex: LocalConversationIndex,
    baseline: LocalConversationIndexBaseline
): Promise<LocalWriteResult> {
    try {
        const current = await readLocalConversationIndex()
        const concurrentConversations =
            current.status === 'valid' && current.data.revision > baseline.revision
                ? current.data.conversations.filter(conversation => !baseline.conversations.some(item => item.id === conversation.id))
                : []
        const normalizedIndex = normalizeLocalConversationIndex({
            ...nextIndex,
            conversations: [...nextIndex.conversations, ...concurrentConversations],
            revision: Math.max(nextIndex.revision, current.status === 'valid' ? current.data.revision : 0) + 1,
        })

        await runStoreOperation(INDEX_STORE, 'readwrite', store => store.put(normalizedIndex, INDEX_KEY))
        return {
            revision: normalizedIndex.revision,
            status: 'written',
        }
    } catch (error) {
        return { status: isQuotaError(error) ? 'quota' : 'unavailable' }
    }
}

export async function readLocalConversationSnapshot(conversationId: string): Promise<LocalReadResult<LocalConversationSnapshot>> {
    try {
        const value = await runStoreOperation<unknown>(SNAPSHOT_STORE, 'readonly', store => store.get(conversationId))

        if (!value) {
            return { status: 'missing' }
        }

        const parsed = localConversationSnapshotSchema.safeParse(value)

        if (!parsed.success) {
            return { status: 'invalid' }
        }

        return {
            data: parsed.data,
            status: 'valid',
        }
    } catch {
        return { status: 'unavailable' }
    }
}

export async function writeLocalConversationSnapshot(snapshot: LocalConversationSnapshot): Promise<LocalWriteResult> {
    try {
        const current = await readLocalConversationSnapshot(snapshot.conversationId)

        if (current.status === 'valid' && current.data.revision > snapshot.revision) {
            return { status: 'stale' }
        }

        await runStoreOperation(SNAPSHOT_STORE, 'readwrite', store => store.put(snapshot))
        return {
            revision: snapshot.revision,
            status: 'written',
        }
    } catch (error) {
        return { status: isQuotaError(error) ? 'quota' : 'unavailable' }
    }
}

export async function deleteLocalConversationSnapshots(conversationIds: string[]) {
    try {
        await openDatabase().then(
            database =>
                new Promise<void>((resolve, reject) => {
                    const transaction = database.transaction(SNAPSHOT_STORE, 'readwrite')
                    const store = transaction.objectStore(SNAPSHOT_STORE)

                    for (const conversationId of conversationIds) {
                        store.delete(conversationId)
                    }

                    transaction.oncomplete = () => {
                        database.close()
                        resolve()
                    }
                    transaction.onerror = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
                    }
                })
        )
    } catch {
        // 删除失败不阻断聊天主链；下次服务端 reconcile 仍可再次清理。
    }
}

function isLocalImageResultCacheEntry(value: unknown): value is LocalImageResultCacheEntry {
    if (!value || typeof value !== 'object') {
        return false
    }

    const entry = value as Partial<LocalImageResultCacheEntry>

    return (
        entry.blob instanceof Blob &&
        entry.byteLength === entry.blob.size &&
        typeof entry.createdAt === 'string' &&
        typeof entry.lastAccessedAt === 'string' &&
        (entry.mimeType === 'image/jpeg' || entry.mimeType === 'image/png' || entry.mimeType === 'image/webp') &&
        typeof entry.runId === 'string' &&
        entry.runId.length > 0 &&
        (entry.conversationId === undefined || (typeof entry.conversationId === 'string' && entry.conversationId.length > 0))
    )
}

function compareImageCacheEntries(left: LocalImageResultCacheEntry, right: LocalImageResultCacheEntry) {
    return (
        left.lastAccessedAt.localeCompare(right.lastAccessedAt) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.runId.localeCompare(right.runId)
    )
}

async function touchLocalImageResultCacheEntry(runId: string, conversationId?: string) {
    try {
        await openDatabase().then(
            database =>
                new Promise<void>((resolve, reject) => {
                    const transaction = database.transaction(IMAGE_RESULT_STORE, 'readwrite')
                    const store = transaction.objectStore(IMAGE_RESULT_STORE)
                    const request = store.get(runId)

                    request.onsuccess = () => {
                        if (isLocalImageResultCacheEntry(request.result)) {
                            store.put({
                                ...request.result,
                                ...(conversationId ? { conversationId } : {}),
                                lastAccessedAt: new Date().toISOString(),
                            })
                        }
                    }
                    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
                    transaction.oncomplete = () => {
                        database.close()
                        resolve()
                    }
                    transaction.onerror = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
                    }
                    transaction.onabort = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
                    }
                })
        )
    } catch {
        // 更新 LRU 失败不应影响已经可读的缓存图片。
    }
}

export async function readLocalImageResultCache(runId: string, conversationId?: string): Promise<LocalImageResultReadResult> {
    try {
        const value = await runStoreOperation<unknown>(IMAGE_RESULT_STORE, 'readonly', store => store.get(runId))

        if (!value) {
            return { status: 'missing' }
        }

        if (!isLocalImageResultCacheEntry(value)) {
            return { status: 'invalid' }
        }

        void touchLocalImageResultCacheEntry(runId, conversationId)
        return { data: value, status: 'valid' }
    } catch {
        return { status: 'unavailable' }
    }
}

export async function writeLocalImageResultCache(input: {
    blob: Blob
    conversationId?: string
    mimeType: LocalImageResultCacheEntry['mimeType']
    runId: string
}): Promise<LocalImageResultWriteResult> {
    if (input.blob.size > LOCAL_IMAGE_RESULT_CACHE_MAX_BYTES) {
        return { status: 'quota' }
    }

    try {
        return await openDatabase().then(
            database =>
                new Promise<LocalImageResultWriteResult>((resolve, reject) => {
                    const transaction = database.transaction(IMAGE_RESULT_STORE, 'readwrite')
                    const store = transaction.objectStore(IMAGE_RESULT_STORE)
                    const request = store.getAll()

                    request.onsuccess = () => {
                        const entries = request.result.filter(isLocalImageResultCacheEntry)
                        const retainedEntries = entries.filter(entry => entry.runId !== input.runId)
                        let retainedBytes = retainedEntries.reduce((total, entry) => total + entry.byteLength, 0)

                        retainedEntries.sort(compareImageCacheEntries)

                        while (
                            retainedEntries.length >= LOCAL_IMAGE_RESULT_CACHE_MAX_COUNT ||
                            retainedBytes + input.blob.size > LOCAL_IMAGE_RESULT_CACHE_MAX_BYTES
                        ) {
                            const evictedEntry = retainedEntries.shift()

                            if (!evictedEntry) {
                                break
                            }

                            retainedBytes -= evictedEntry.byteLength
                            store.delete(evictedEntry.runId)
                        }

                        const now = new Date().toISOString()
                        store.put({
                            blob: input.blob,
                            byteLength: input.blob.size,
                            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
                            createdAt: now,
                            lastAccessedAt: now,
                            mimeType: input.mimeType,
                            runId: input.runId,
                        } satisfies LocalImageResultCacheEntry)
                    }
                    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
                    transaction.oncomplete = () => {
                        database.close()
                        resolve({ status: 'written' })
                    }
                    transaction.onerror = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
                    }
                    transaction.onabort = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
                    }
                })
        )
    } catch (error) {
        return { status: isQuotaError(error) ? 'quota' : 'unavailable' }
    }
}

export async function deleteLocalImageResultCaches(conversationIds: string[]) {
    if (conversationIds.length === 0) {
        return
    }

    try {
        await openDatabase().then(
            database =>
                new Promise<void>((resolve, reject) => {
                    const transaction = database.transaction(IMAGE_RESULT_STORE, 'readwrite')
                    const store = transaction.objectStore(IMAGE_RESULT_STORE)
                    const request = store.getAll()
                    const conversationIdSet = new Set(conversationIds)

                    request.onsuccess = () => {
                        for (const entry of request.result.filter(isLocalImageResultCacheEntry)) {
                            if (entry.conversationId && conversationIdSet.has(entry.conversationId)) {
                                store.delete(entry.runId)
                            }
                        }
                    }
                    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
                    transaction.oncomplete = () => {
                        database.close()
                        resolve()
                    }
                    transaction.onerror = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
                    }
                    transaction.onabort = () => {
                        database.close()
                        reject(transaction.error ?? new Error('IndexedDB transaction aborted.'))
                    }
                })
        )
    } catch {
        // 图片缓存清理失败不影响已确认的会话删除；容量淘汰会在后续写入时兜底。
    }
}

export function createIndexFromRegistry(options: {
    conversations: LocalConversationMetadata[]
    isDraft: boolean
    previousRevision?: number
    selectedConversationId: string | null
}): LocalConversationIndex {
    const now = new Date().toISOString()
    const conversations = options.conversations.slice(0, LOCAL_CHAT_RECENT_LIMIT).map(conversation => ({
        createdAt: conversation.createdAt,
        hasMessages: conversation.hasMessages,
        id: conversation.id,
        lastActiveAt: conversation.lastActiveAt,
        title: conversation.title,
    }))

    return normalizeLocalConversationIndex({
        conversations,
        isDraft: options.isDraft,
        revision: (options.previousRevision ?? 0) + 1,
        schemaVersion: LOCAL_CHAT_SCHEMA_VERSION,
        selectedConversationId: options.selectedConversationId,
        updatedAt: now,
    })
}
