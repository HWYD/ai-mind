import { type BaseStore } from '@langchain/langgraph'

import { getUserMemoryStore } from './provider'
import { selectRelevantUserMemories } from './retrieval'
import { getUserMemoryRuntimeConfig, type UserMemoryRuntimeConfig } from './runtime-config'
import type {
    SelectedUserMemory,
    UserMemoryCandidate,
    UserMemoryDocument,
    UserMemoryIdentity,
    UserMemoryPromotionResult,
    UserMemoryWriteResult,
} from './state-schema'
import { buildUserMemoryNamespace, createUserMemoryDocument, readUserMemoryDocumentValue, validateUserMemoryCandidate } from './validation'

function logUserMemoryServiceEvent(event: string, meta: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info('[user-memory-service]', JSON.stringify({ event, ...meta }))
}

export interface UserMemoryService {
    promotePinnedDecisionDiff(input: {
        previousPinnedDecisions: string[]
        nextPinnedDecisions: string[]
        sessionId: string
        sourceConversationId: string
    }): Promise<UserMemoryPromotionResult>
    putCandidate(input: { candidate: UserMemoryCandidate; sessionId: string }): Promise<UserMemoryWriteResult>
    retrieveRelevantMemories(input: { latestUserText: string; sessionId: string }): Promise<SelectedUserMemory[]>
}

interface CreateUserMemoryServiceOptions {
    now?: () => Date
    store?: BaseStore
}

let sharedUserMemoryService: UserMemoryService | undefined
let sharedUserMemoryServiceKey: string | undefined

function buildUserMemoryServiceKey(config: UserMemoryRuntimeConfig, env: Record<string, string | undefined>): string {
    return [config.storeMode, config.postgresSchema, env.NODE_ENV ?? '', env.DATABASE_URL?.trim() ?? ''].join('|')
}

function toStoredValue(document: UserMemoryDocument): Record<string, unknown> {
    return document as unknown as Record<string, unknown>
}

function isDraftSourceConversationId(sourceConversationId: string | undefined): boolean {
    const normalized = sourceConversationId?.trim()

    return normalized === '__draft__' || normalized?.startsWith('__draft__:') === true
}

function areSameTags(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function areSameIdentity(left: UserMemoryIdentity, right: UserMemoryIdentity): boolean {
    return left.subject === right.subject && left.facet === right.facet && left.polarity === right.polarity
}

function isDuplicateDocument(existing: UserMemoryDocument | null, nextDocument: UserMemoryDocument): boolean {
    if (!existing) {
        return false
    }

    return (
        existing.stableKey === nextDocument.stableKey &&
        existing.status === nextDocument.status &&
        existing.type === nextDocument.type &&
        areSameIdentity(existing.identity, nextDocument.identity) &&
        existing.text === nextDocument.text &&
        areSameTags(existing.tags, nextDocument.tags)
    )
}

async function readExistingDocument(store: BaseStore, namespace: string[], stableKey: string): Promise<UserMemoryDocument | null> {
    const item = await store.get(namespace, stableKey)

    return readUserMemoryDocumentValue(item)
}

async function readNamespaceDocuments(store: BaseStore, namespace: string[]): Promise<UserMemoryDocument[]> {
    const items = await store.search(namespace, {
        limit: 100,
    })

    return items.map(item => readUserMemoryDocumentValue(item)).filter((document): document is UserMemoryDocument => document !== null)
}

export function createUserMemoryService(
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateUserMemoryServiceOptions = {}
): UserMemoryService {
    const now = options.now ?? (() => new Date())
    const getStore = () => {
        if (options.store) {
            return options.store
        }

        return getUserMemoryStore(config, env)
    }

    return {
        async putCandidate({ candidate, sessionId }) {
            if (!sessionId?.trim()) {
                return {
                    reason: 'missing-session',
                    status: 'skipped',
                }
            }

            if (!candidate.sourceConversationId?.trim() || isDraftSourceConversationId(candidate.sourceConversationId)) {
                return {
                    reason: 'missing-source-conversation',
                    status: 'skipped',
                }
            }

            const validation = validateUserMemoryCandidate(candidate, config)

            if (validation.status === 'rejected') {
                return validation
            }

            try {
                const store = getStore()
                const namespace = buildUserMemoryNamespace(sessionId, env)
                const existing = await readExistingDocument(store, namespace, validation.candidate.stableKey)
                const nextDocument = createUserMemoryDocument(validation.candidate, now().toISOString(), existing)

                if (isDuplicateDocument(existing, nextDocument)) {
                    return {
                        reason: 'duplicate',
                        status: 'rejected',
                    }
                }

                await store.put(namespace, validation.candidate.stableKey, toStoredValue(nextDocument), false)

                if (nextDocument.status === 'suppressed') {
                    return {
                        stableKey: validation.candidate.stableKey,
                        status: 'suppressed',
                    }
                }

                if (existing) {
                    return {
                        stableKey: validation.candidate.stableKey,
                        status: 'updated',
                    }
                }

                return {
                    stableKey: validation.candidate.stableKey,
                    status: 'written',
                }
            } catch (error) {
                logUserMemoryServiceEvent('put-failed', {
                    errorName: error instanceof Error ? error.name : 'UnknownError',
                })

                return {
                    reason: 'store-unavailable',
                    status: 'skipped',
                }
            }
        },

        async retrieveRelevantMemories({ latestUserText, sessionId }) {
            if (!sessionId?.trim() || !latestUserText.trim()) {
                return []
            }

            try {
                const store = getStore()
                const namespace = buildUserMemoryNamespace(sessionId, env)
                const documents = await readNamespaceDocuments(store, namespace)

                return selectRelevantUserMemories(documents, latestUserText, config)
            } catch (error) {
                logUserMemoryServiceEvent('retrieve-failed', {
                    errorName: error instanceof Error ? error.name : 'UnknownError',
                })
                return []
            }
        },

        async promotePinnedDecisionDiff({ nextPinnedDecisions, previousPinnedDecisions, sessionId, sourceConversationId }) {
            if (!sessionId?.trim()) {
                return {
                    reason: 'missing-session',
                    status: 'skipped',
                }
            }

            if (!sourceConversationId?.trim() || isDraftSourceConversationId(sourceConversationId)) {
                return {
                    reason: 'missing-source-conversation',
                    status: 'skipped',
                }
            }

            const changedDecisions = nextPinnedDecisions
                .map(decision => decision.trim())
                .filter(decision => decision.length > 0 && !previousPinnedDecisions.includes(decision))

            if (changedDecisions.length === 0) {
                return {
                    reason: 'no-diff',
                    status: 'skipped',
                }
            }

            let written = 0
            let updated = 0
            let suppressed = 0
            let rejected = 0

            for (const decision of changedDecisions) {
                const result = await this.putCandidate({
                    candidate: {
                        action: 'add',
                        confidence: 0.85,
                        identity: {
                            subject: decision,
                        },
                        reason: 'pinned-decision-diff',
                        source: 'pinned_decision_promotion',
                        sourceConversationId,
                        sourceSignal: 'pinned_decision_signal',
                        sourceText: decision,
                        stability: 'stable',
                        tags: [],
                        text: decision,
                        type: 'standing_instruction',
                    },
                    sessionId,
                })

                switch (result.status) {
                    case 'written':
                        written += 1
                        break
                    case 'updated':
                        updated += 1
                        break
                    case 'suppressed':
                        suppressed += 1
                        break
                    case 'rejected':
                        rejected += 1
                        break
                    case 'skipped':
                        return {
                            reason: 'store-unavailable',
                            status: 'failed',
                        }
                }
            }

            return {
                candidates: changedDecisions.length,
                rejected,
                status: 'processed',
                suppressed,
                updated,
                written,
            }
        },
    }
}

export function getUserMemoryService(
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateUserMemoryServiceOptions = {}
): UserMemoryService {
    if (options.store || options.now) {
        return createUserMemoryService(config, env, options)
    }

    const serviceKey = buildUserMemoryServiceKey(config, env)

    if (!sharedUserMemoryService || sharedUserMemoryServiceKey !== serviceKey) {
        sharedUserMemoryService = createUserMemoryService(config, env)
        sharedUserMemoryServiceKey = serviceKey
    }

    return sharedUserMemoryService
}

export const userMemoryService: UserMemoryService = {
    promotePinnedDecisionDiff(input) {
        return getUserMemoryService().promotePinnedDecisionDiff(input)
    },
    putCandidate(input) {
        return getUserMemoryService().putCandidate(input)
    },
    retrieveRelevantMemories(input) {
        return getUserMemoryService().retrieveRelevantMemories(input)
    },
}
