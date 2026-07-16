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
const DATABASE_VERSION = 1
const INDEX_STORE = 'conversation-index'
const SNAPSHOT_STORE = 'conversation-snapshots'
const INDEX_KEY = 'current'

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
