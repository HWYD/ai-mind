;(async () => {
    const DATABASE_NAME = 'ai-mind-local-chat'
    const DATABASE_VERSION = 2
    const INDEX_STORE = 'conversation-index'
    const INDEX_KEY = 'current'
    const SNAPSHOT_STORE = 'conversation-snapshots'
    const IMAGE_RESULT_STORE = 'image-results'
    const FIXTURE_IMAGE_RUN_ID = 'v053-message-virtualization-fixture:session-image'
    const BACKUP_STORAGE_KEY = 'ai-mind:v053-message-virtualization-fixture-session-backup'
    const SELECTED_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-conversation-id'
    const DRAFT_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-draft'

    function fail(message) {
        throw new Error(`[AI Mind v0.5.3 fixture cleanup] ${message}`)
    }

    async function openExistingDatabase() {
        if (typeof indexedDB.databases === 'function') {
            const databases = await indexedDB.databases()

            if (!databases.some(database => database.name === DATABASE_NAME)) {
                fail('未找到 ai-mind-local-chat 数据库，无法安全执行 cleanup。')
            }
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

            request.onupgradeneeded = () => {
                request.transaction?.abort()
                reject(new Error('本地聊天数据库版本不匹配，已中止 cleanup。'))
            }
            request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
            request.onsuccess = () => resolve(request.result)
        })
    }

    function restoreStoredValue(key, value) {
        if (value === null) {
            localStorage.removeItem(key)
            return
        }

        localStorage.setItem(key, value)
    }

    const rawBackup = localStorage.getItem(BACKUP_STORAGE_KEY)

    if (!rawBackup) {
        fail('未找到 fixture backup；为避免影响真实本地会话，cleanup 未执行任何删除。')
    }

    let backup

    try {
        backup = JSON.parse(rawBackup)
    } catch {
        fail('fixture backup 无法解析；cleanup 未执行任何删除。')
    }

    if (!backup || backup.version !== 1 || !Object.hasOwn(backup, 'index') || typeof backup.targetConversationId !== 'string') {
        fail('fixture backup 格式无效；cleanup 未执行任何删除。')
    }

    const database = await openExistingDatabase()

    try {
        await new Promise((resolve, reject) => {
            const transaction = database.transaction([INDEX_STORE, SNAPSHOT_STORE, IMAGE_RESULT_STORE], 'readwrite')

            if (backup.index === null) {
                transaction.objectStore(INDEX_STORE).delete(INDEX_KEY)
            } else {
                transaction.objectStore(INDEX_STORE).put(backup.index, INDEX_KEY)
            }
            if (backup.targetSnapshot === null) {
                transaction.objectStore(SNAPSHOT_STORE).delete(backup.targetConversationId)
            } else {
                transaction.objectStore(SNAPSHOT_STORE).put(backup.targetSnapshot)
            }
            transaction.objectStore(IMAGE_RESULT_STORE).delete(FIXTURE_IMAGE_RUN_ID)
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB fixture cleanup failed.'))
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB fixture cleanup aborted.'))
        })

        restoreStoredValue(SELECTED_CONVERSATION_STORAGE_KEY, backup.selectedConversation)
        restoreStoredValue(DRAFT_CONVERSATION_STORAGE_KEY, backup.draftSelection)
        localStorage.removeItem(BACKUP_STORAGE_KEY)
        console.info('[AI Mind v0.5.3 fixture] cleanup 完成：测试会话快照、fixture image cache 与 fixture backup 已恢复。')
    } finally {
        database.close()
    }
})().catch(error => {
    console.error(error)
})
