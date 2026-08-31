import type { LocalConversationSnapshot } from '@/components/instamind/local-chat-persistence/schema'
import type { LocalImageResultCacheEntry } from '@/components/instamind/local-chat-persistence/store'
import type { AgentStepPart, MindMessage, MindMessagePart } from '@/lib/ai/types/message'

export const INDEXED_DB_FIXTURE_CONVERSATION_ID = 'v053-message-virtualization-fixture'
export const INDEXED_DB_FIXTURE_IMAGE_RUN_ID = 'v053-message-virtualization-fixture:image'
export const INDEXED_DB_FIXTURE_MESSAGE_COUNT = 1000
export const INDEXED_DB_FIXTURE_BACKUP_STORAGE_KEY = 'ai-mind:v053-message-virtualization-fixture-backup'

export class IndexedDbFixturePreflightError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'IndexedDbFixturePreflightError'
    }
}

export function getIndexedDbFixtureCleanupTargets() {
    return {
        backupStorageKey: INDEXED_DB_FIXTURE_BACKUP_STORAGE_KEY,
        conversationId: INDEXED_DB_FIXTURE_CONVERSATION_ID,
        imageRunId: INDEXED_DB_FIXTURE_IMAGE_RUN_ID,
    }
}

interface IndexedDbFixtureInput {
    conversationId?: string
    imageCacheEntries: LocalImageResultCacheEntry[]
    now?: string
    snapshots: LocalConversationSnapshot[]
}

interface IndexedDbFixturePayload {
    conversationId: string
    imageCacheEntry: LocalImageResultCacheEntry
    messages: MindMessage[]
    primaryMessageCount: number
    sourceSummary: {
        agentConversationId: string
        imageConversationId: string
        primaryConversationId: string
        primarySourceMessageCount: number
        textConversationId: string
    }
}

interface MessageDonor {
    conversationId: string
    message: MindMessage
}

interface ImageDonor extends MessageDonor {
    cacheEntry: LocalImageResultCacheEntry
}

function compareSnapshots(left: LocalConversationSnapshot, right: LocalConversationSnapshot) {
    return (
        right.messages.length - left.messages.length ||
        right.lastActiveAt.localeCompare(left.lastActiveAt) ||
        left.conversationId.localeCompare(right.conversationId)
    )
}

function isCompletedMessage(message: MindMessage) {
    return (
        (message.role === 'assistant' || message.role === 'user') &&
        (message.status === undefined || message.status === 'completed') &&
        message.parts.length > 0 &&
        message.parts.every(part => part.type !== 'agent-interrupt')
    )
}

function findTextDonor(snapshots: LocalConversationSnapshot[]): MessageDonor | null {
    for (const snapshot of snapshots) {
        const message = snapshot.messages.find(
            candidate => isCompletedMessage(candidate) && candidate.parts.some(part => part.type === 'text')
        )

        if (message) {
            return { conversationId: snapshot.conversationId, message }
        }
    }

    return null
}

function findAgentDonor(snapshots: LocalConversationSnapshot[]): MessageDonor | null {
    for (const snapshot of snapshots) {
        const message = snapshot.messages.find(
            candidate =>
                isCompletedMessage(candidate) && candidate.parts.some(part => part.type === 'agent-step' && part.status === 'completed')
        )

        if (message) {
            return { conversationId: snapshot.conversationId, message }
        }
    }

    return null
}

function findImageDonor(snapshots: LocalConversationSnapshot[], imageCacheEntries: LocalImageResultCacheEntry[]): ImageDonor | null {
    for (const snapshot of snapshots) {
        for (const message of snapshot.messages) {
            if (!isCompletedMessage(message)) {
                continue
            }

            const imageResult = message.parts.find(part => part.type === 'image-result')
            const cacheEntry = imageResult ? imageCacheEntries.find(entry => entry.runId === imageResult.runId) : undefined

            if (cacheEntry && cacheEntry.blob instanceof Blob && cacheEntry.byteLength === cacheEntry.blob.size) {
                return { cacheEntry, conversationId: snapshot.conversationId, message }
            }
        }
    }

    return null
}

function createFixtureId(kind: string, messageIndex: number, partIndex?: number) {
    return `${INDEXED_DB_FIXTURE_CONVERSATION_ID}:${kind}:${messageIndex}${partIndex === undefined ? '' : `:${partIndex}`}`
}

function cloneAgentPart(part: AgentStepPart, messageIndex: number, partIndex: number): AgentStepPart {
    const runId = createFixtureId('agent-run', messageIndex, partIndex)
    const nodeIds = new Map(
        part.graph.nodes.map((node, nodeIndex) => [node.nodeId, createFixtureId('agent-node', messageIndex, partIndex * 100 + nodeIndex)])
    )

    return {
        ...part,
        graph: {
            ...part.graph,
            ...(part.graph.debugSummary
                ? {
                      debugSummary: {
                          ...part.graph.debugSummary,
                          runId,
                          threadId: createFixtureId('agent-thread', messageIndex, partIndex),
                      },
                  }
                : {}),
            nodes: part.graph.nodes.map((node, nodeIndex) => ({
                ...node,
                nodeId: nodeIds.get(node.nodeId) ?? createFixtureId('agent-node', messageIndex, partIndex * 100 + nodeIndex),
                partId: createFixtureId('agent-node-part', messageIndex, partIndex * 100 + nodeIndex),
            })),
            routes: part.graph.routes.map((route, routeIndex) => ({
                ...route,
                fromNodeId:
                    nodeIds.get(route.fromNodeId) ?? createFixtureId('agent-route-from', messageIndex, partIndex * 100 + routeIndex),
                toNodeId: nodeIds.get(route.toNodeId) ?? createFixtureId('agent-route-to', messageIndex, partIndex * 100 + routeIndex),
            })),
        },
        id: createFixtureId('part', messageIndex, partIndex),
        runId,
    }
}

function clonePart(part: MindMessagePart, messageIndex: number, partIndex: number): MindMessagePart {
    if (part.type === 'agent-step') {
        return cloneAgentPart(part, messageIndex, partIndex)
    }

    const id = createFixtureId('part', messageIndex, partIndex)

    if (part.type === 'image-brief' || part.type === 'image-result') {
        return {
            ...part,
            id,
            runId: INDEXED_DB_FIXTURE_IMAGE_RUN_ID,
        }
    }

    return {
        ...part,
        id,
    }
}

function cloneMessage(source: MindMessage, messageIndex: number, createdAt: string): MindMessage {
    return {
        ...source,
        ...(source.artifacts
            ? {
                  artifacts: source.artifacts.map((artifact, artifactIndex) => ({
                      ...artifact,
                      artifactId: createFixtureId('artifact', messageIndex, artifactIndex),
                  })),
              }
            : {}),
        createdAt,
        id: createFixtureId('message', messageIndex),
        parts: source.parts.map((part, partIndex) => clonePart(part, messageIndex, partIndex)),
        status: 'completed',
    }
}

function ensureDonor<T>(donor: T | null, message: string): T {
    if (!donor) {
        throw new IndexedDbFixturePreflightError(message)
    }

    return donor
}

export function buildIndexedDbFixturePayload(input: IndexedDbFixtureInput): IndexedDbFixturePayload {
    const conversationId = input.conversationId ?? INDEXED_DB_FIXTURE_CONVERSATION_ID
    const snapshots = input.snapshots
        .map(snapshot => ({ ...snapshot, messages: snapshot.messages.filter(isCompletedMessage) }))
        .filter(snapshot => snapshot.messages.length > 0)
        .sort(compareSnapshots)
    const primary = ensureDonor(snapshots[0], '缺少可用于扩容的已完成本地会话。')
    const textDonor = ensureDonor(findTextDonor(snapshots), '缺少包含文本的已完成消息 donor。')
    const imageDonor = ensureDonor(findImageDonor(snapshots, input.imageCacheEntries), '缺少带本地缓存 Blob 的 image-result donor。')
    const agentDonor = ensureDonor(findAgentDonor(snapshots), '缺少已完成 agent-step donor。')
    const now = input.now ?? new Date().toISOString()
    const baseTime = Date.parse(now)

    if (Number.isNaN(baseTime)) {
        throw new IndexedDbFixturePreflightError('fixture 时间必须是有效 ISO 时间。')
    }

    const messages = Array.from({ length: INDEXED_DB_FIXTURE_MESSAGE_COUNT }, (_, messageIndex) => {
        const source =
            messageIndex % 50 === 49
                ? imageDonor.message
                : messageIndex % 50 === 39
                  ? agentDonor.message
                  : (primary.messages[messageIndex % primary.messages.length] ?? textDonor.message)

        return cloneMessage(source, messageIndex, new Date(baseTime + messageIndex * 1000).toISOString())
    })
    const primaryMessageCount = messages.filter((_, messageIndex) => messageIndex % 50 !== 49 && messageIndex % 50 !== 39).length

    return {
        conversationId,
        imageCacheEntry: {
            ...imageDonor.cacheEntry,
            conversationId,
            createdAt: now,
            lastAccessedAt: now,
            runId: INDEXED_DB_FIXTURE_IMAGE_RUN_ID,
        },
        messages,
        primaryMessageCount,
        sourceSummary: {
            agentConversationId: agentDonor.conversationId,
            imageConversationId: imageDonor.conversationId,
            primaryConversationId: primary.conversationId,
            primarySourceMessageCount: primary.messages.length,
            textConversationId: textDonor.conversationId,
        },
    }
}
