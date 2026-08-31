;(async () => {
    const DATABASE_NAME = 'ai-mind-local-chat'
    const DATABASE_VERSION = 2
    const INDEX_STORE = 'conversation-index'
    const INDEX_KEY = 'current'
    const SNAPSHOT_STORE = 'conversation-snapshots'
    const IMAGE_RESULT_STORE = 'image-results'
    const LEGACY_FIXTURE_CONVERSATION_ID = 'v053-message-virtualization-fixture'
    const FIXTURE_ID_PREFIX = 'v053-message-virtualization-fixture'
    const FIXTURE_IMAGE_RUN_ID = 'v053-message-virtualization-fixture:session-image'
    const FIXTURE_MESSAGE_COUNT = 1000
    const FIXTURE_TITLE = '1000条测试数据'
    const BACKUP_STORAGE_KEY = 'ai-mind:v053-message-virtualization-fixture-session-backup'
    const SELECTED_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-conversation-id'
    const DRAFT_CONVERSATION_STORAGE_KEY = 'ai-mind:selected-draft'

    function fail(message) {
        throw new Error(`[AI Mind v0.5.3 fixture] ${message}`)
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
        })
    }

    async function openExistingDatabase() {
        if (typeof indexedDB.databases === 'function') {
            const databases = await indexedDB.databases()

            if (!databases.some(database => database.name === DATABASE_NAME)) {
                fail('未找到现有 ai-mind-local-chat 数据库；请先在本地应用打开一个已保存会话。')
            }
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

            request.onupgradeneeded = () => {
                request.transaction?.abort()
                reject(new Error('本地聊天数据库版本不匹配，已中止以避免创建或升级数据库。'))
            }
            request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'))
            request.onsuccess = () => resolve(request.result)
        })
    }

    function readFixtureSource(database) {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction([INDEX_STORE, SNAPSHOT_STORE, IMAGE_RESULT_STORE], 'readonly')
            const indexRequest = transaction.objectStore(INDEX_STORE).get(INDEX_KEY)
            const snapshotsRequest = transaction.objectStore(SNAPSHOT_STORE).getAll()
            const imageCacheRequest = transaction.objectStore(IMAGE_RESULT_STORE).getAll()

            transaction.oncomplete = () =>
                resolve({
                    imageCacheEntries: imageCacheRequest.result,
                    index: indexRequest.result ?? null,
                    snapshots: snapshotsRequest.result,
                })
            transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB source read failed.'))
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB source read aborted.'))
        })
    }

    function isCompletedMessage(message) {
        return (
            message &&
            (message.role === 'assistant' || message.role === 'user') &&
            (message.status === undefined || message.status === 'completed') &&
            Array.isArray(message.parts) &&
            message.parts.length > 0 &&
            message.parts.every(part => part.type !== 'agent-interrupt')
        )
    }

    function sortedSnapshots(rawSnapshots, targetConversationId) {
        return rawSnapshots
            .filter(snapshot => snapshot && Array.isArray(snapshot.messages))
            .map(snapshot => ({ ...snapshot, messages: snapshot.messages.filter(isCompletedMessage) }))
            .filter(
                snapshot =>
                    snapshot.messages.length > 0 &&
                    typeof snapshot.conversationId === 'string' &&
                    snapshot.conversationId !== LEGACY_FIXTURE_CONVERSATION_ID &&
                    snapshot.conversationId !== targetConversationId
            )
            .sort(
                (left, right) =>
                    right.messages.length - left.messages.length ||
                    String(right.lastActiveAt).localeCompare(String(left.lastActiveAt)) ||
                    left.conversationId.localeCompare(right.conversationId)
            )
    }

    function findTextDonor(snapshots) {
        for (const snapshot of snapshots) {
            const message = snapshot.messages.find(candidate => candidate.parts.some(part => part.type === 'text'))

            if (message) {
                return { conversationId: snapshot.conversationId, message }
            }
        }

        return null
    }

    function findAgentDonor(snapshots) {
        for (const snapshot of snapshots) {
            const message = snapshot.messages.find(candidate =>
                candidate.parts.some(part => part.type === 'agent-step' && part.status === 'completed')
            )

            if (message) {
                return { conversationId: snapshot.conversationId, message }
            }
        }

        return null
    }

    function findImageDonor(snapshots, imageCacheEntries) {
        for (const snapshot of snapshots) {
            for (const message of snapshot.messages) {
                const imageResult = message.parts.find(part => part.type === 'image-result')
                const cacheEntry = imageResult ? imageCacheEntries.find(entry => entry?.runId === imageResult.runId) : null

                if (cacheEntry?.blob instanceof Blob && cacheEntry.byteLength === cacheEntry.blob.size) {
                    return { cacheEntry, conversationId: snapshot.conversationId, message }
                }
            }
        }

        return null
    }

    function fixtureId(kind, messageIndex, partIndex) {
        return `${FIXTURE_ID_PREFIX}:${kind}:${messageIndex}${partIndex === undefined ? '' : `:${partIndex}`}`
    }

    function clonePart(part, messageIndex, partIndex) {
        const clone = structuredClone(part)
        const id = fixtureId('part', messageIndex, partIndex)

        if (clone.type === 'image-brief' || clone.type === 'image-result') {
            return { ...clone, id, runId: FIXTURE_IMAGE_RUN_ID }
        }

        if (clone.type !== 'agent-step') {
            return { ...clone, id }
        }

        const runId = fixtureId('agent-run', messageIndex, partIndex)
        const nodeIds = new Map(
            (clone.graph?.nodes ?? []).map((node, nodeIndex) => [
                node.nodeId,
                fixtureId('agent-node', messageIndex, partIndex * 100 + nodeIndex),
            ])
        )
        const graph = clone.graph ?? { nodes: [], routes: [], runtime: 'LangGraph' }

        return {
            ...clone,
            graph: {
                ...graph,
                ...(graph.debugSummary
                    ? {
                          debugSummary: {
                              ...graph.debugSummary,
                              runId,
                              threadId: fixtureId('agent-thread', messageIndex, partIndex),
                          },
                      }
                    : {}),
                nodes: (graph.nodes ?? []).map((node, nodeIndex) => ({
                    ...node,
                    nodeId: nodeIds.get(node.nodeId) ?? fixtureId('agent-node', messageIndex, partIndex * 100 + nodeIndex),
                    partId: fixtureId('agent-node-part', messageIndex, partIndex * 100 + nodeIndex),
                })),
                routes: (graph.routes ?? []).map((route, routeIndex) => ({
                    ...route,
                    fromNodeId: nodeIds.get(route.fromNodeId) ?? fixtureId('agent-route-from', messageIndex, partIndex * 100 + routeIndex),
                    toNodeId: nodeIds.get(route.toNodeId) ?? fixtureId('agent-route-to', messageIndex, partIndex * 100 + routeIndex),
                })),
            },
            id,
            runId,
        }
    }

    function cloneMessage(source, messageIndex, createdAt) {
        const clone = structuredClone(source)

        return {
            ...clone,
            ...(Array.isArray(clone.artifacts)
                ? {
                      artifacts: clone.artifacts.map((artifact, artifactIndex) => ({
                          ...artifact,
                          artifactId: fixtureId('artifact', messageIndex, artifactIndex),
                      })),
                  }
                : {}),
            createdAt,
            id: fixtureId('message', messageIndex),
            parts: clone.parts.map((part, partIndex) => clonePart(part, messageIndex, partIndex)),
            status: 'completed',
        }
    }

    function buildFixture(source, targetConversationId, now) {
        const snapshots = sortedSnapshots(source.snapshots, targetConversationId)
        const primary = snapshots[0]

        if (!primary) {
            fail('缺少可用于扩容的已完成本地会话。')
        }

        const textDonor = findTextDonor(snapshots)
        const imageDonor = findImageDonor(snapshots, source.imageCacheEntries)
        const agentDonor = findAgentDonor(snapshots)

        if (!textDonor) {
            fail('缺少包含文本的已完成消息 donor。')
        }
        if (!imageDonor) {
            fail('缺少带本地缓存 Blob 的 image-result donor。')
        }
        if (!agentDonor) {
            fail('缺少已完成 agent-step donor。')
        }

        const baseTime = Date.parse(now)
        const messages = Array.from({ length: FIXTURE_MESSAGE_COUNT }, (_, messageIndex) => {
            const sourceMessage =
                messageIndex % 50 === 49
                    ? imageDonor.message
                    : messageIndex % 50 === 39
                      ? agentDonor.message
                      : (primary.messages[messageIndex % primary.messages.length] ?? textDonor.message)

            return cloneMessage(sourceMessage, messageIndex, new Date(baseTime + messageIndex * 1000).toISOString())
        })

        return {
            imageCacheEntry: {
                ...imageDonor.cacheEntry,
                conversationId: targetConversationId,
                createdAt: now,
                lastAccessedAt: now,
                runId: FIXTURE_IMAGE_RUN_ID,
            },
            messages,
        }
    }

    function writeFixture(database, index, targetConversationId, fixture, now) {
        const existingConversations = Array.isArray(index?.conversations) ? index.conversations : []
        const nextIndex = {
            conversations: existingConversations
                .map(conversation =>
                    conversation?.id === targetConversationId ? { ...conversation, lastActiveAt: now, title: FIXTURE_TITLE } : conversation
                )
                .sort((left, right) => String(right.lastActiveAt).localeCompare(String(left.lastActiveAt)))
                .slice(0, 50),
            isDraft: false,
            revision: Number.isInteger(index?.revision) ? index.revision + 1 : 1,
            schemaVersion: 1,
            selectedConversationId: targetConversationId,
            updatedAt: now,
        }
        const snapshot = {
            conversationId: targetConversationId,
            createdAt: now,
            lastActiveAt: now,
            messages: fixture.messages,
            revision: 1,
            schemaVersion: 1,
            snapshotAt: now,
            title: FIXTURE_TITLE,
        }

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([INDEX_STORE, SNAPSHOT_STORE, IMAGE_RESULT_STORE], 'readwrite')

            transaction.objectStore(INDEX_STORE).put(nextIndex, INDEX_KEY)
            transaction.objectStore(SNAPSHOT_STORE).put(snapshot)
            transaction.objectStore(IMAGE_RESULT_STORE).put(fixture.imageCacheEntry)
            transaction.oncomplete = () => resolve()
            transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB fixture write failed.'))
            transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB fixture write aborted.'))
        })
    }

    if (localStorage.getItem(BACKUP_STORAGE_KEY)) {
        fail('检测到未清理的 fixture backup；请先运行 cleanup Snippet。')
    }

    const database = await openExistingDatabase()

    try {
        const source = await readFixtureSource(database)
        const targetConversationId = localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY)?.trim()

        if (!targetConversationId || !source.index?.conversations?.some(conversation => conversation?.id === targetConversationId)) {
            fail('请先新建并发送标题为“1000条测试数据”的普通会话，再运行 seed。')
        }

        const now = new Date().toISOString()
        const fixture = buildFixture(source, targetConversationId, now)
        const backup = {
            draftSelection: localStorage.getItem(DRAFT_CONVERSATION_STORAGE_KEY),
            index: source.index,
            selectedConversation: localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY),
            targetConversationId,
            targetSnapshot: source.snapshots.find(snapshot => snapshot?.conversationId === targetConversationId) ?? null,
            version: 1,
        }

        localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backup))

        try {
            await writeFixture(database, source.index, targetConversationId, fixture, now)
        } catch (error) {
            localStorage.removeItem(BACKUP_STORAGE_KEY)
            throw error
        }

        localStorage.removeItem(DRAFT_CONVERSATION_STORAGE_KEY)
        localStorage.setItem(SELECTED_CONVERSATION_STORAGE_KEY, targetConversationId)
        console.info('[AI Mind v0.5.3 fixture] 已写入本地只读验收数据。', {
            donors: {
                completedAgentTrace: true,
                imageCache: true,
                text: true,
            },
            fixtureId: targetConversationId,
            messageCount: fixture.messages.length,
        })
    } finally {
        database.close()
    }
})().catch(error => {
    console.error(error)
})
