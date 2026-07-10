import { type BaseStore } from '@langchain/langgraph'
import type { SearchItem } from '@langchain/langgraph-checkpoint-postgres/store'

import { getUserMemoryRuntimeConfig, type UserMemoryRuntimeConfig } from './runtime-config'
import type {
    SelectedUserMemory,
    UserMemoryDocument,
    UserMemoryPath,
    UserMemorySemanticCandidate,
    UserMemorySemanticRetrievalRequest,
    UserMemorySemanticSearchItem,
} from './state-schema'
import { buildUserMemoryNamespace, clipUserMemoryText, isUserMemorySemanticEligible, readUserMemoryDocumentValue } from './validation'

const USER_MEMORY_NEGATION_TOKENS = ['不吃', '不要', '别', '不想', '别按这个', '别推荐']
const USER_MEMORY_POSITIVE_TOKENS = ['想吃', '可以吃', '喜欢吃', '想要']

interface VectorSearchCapableStore extends BaseStore {
    search(
        namespace: string[],
        options: {
            limit?: number
            mode?: 'vector'
            query?: string
        }
    ): Promise<SearchItem[]>
}

function logUserMemoryRetrievalEvent(event: string, meta: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info('[user-memory-retrieval]', JSON.stringify({ event, ...meta }))
}

function normalizeWhitespace(text: string): string {
    return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function normalizeSemanticText(text: string): string {
    return normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function normalizeSemanticQuery(latestUserText: string, config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()): string {
    const normalized = normalizeWhitespace(latestUserText)

    if (normalized.length <= config.semanticQueryMaxChars) {
        return normalized
    }

    const head = normalized.slice(0, config.semanticQueryHeadChars)
    const tail = normalized.slice(-config.semanticQueryTailChars)

    return `${head}${tail}`.slice(0, config.semanticQueryMaxChars)
}

function hasAnyToken(text: string, tokens: string[]): boolean {
    return tokens.some(token => text.includes(token))
}

function hasCurrentInputConflict(document: UserMemoryDocument, normalizedQuery: string): boolean {
    const subject = normalizeSemanticText(document.identity.subject)

    if (!subject || !normalizedQuery.includes(subject) || document.type !== 'user_preference') {
        return false
    }

    if (document.identity.polarity === 'prefer') {
        return hasAnyToken(normalizedQuery, USER_MEMORY_NEGATION_TOKENS)
    }

    if (document.identity.polarity === 'avoid') {
        return hasAnyToken(normalizedQuery, USER_MEMORY_POSITIVE_TOKENS)
    }

    return false
}

function toSemanticSearchItems(items: SearchItem[]): UserMemorySemanticSearchItem[] {
    return items
        .map(item => {
            const document = readUserMemoryDocumentValue(item)

            if (!document) {
                return null
            }

            return {
                document,
                key: item.key,
                namespace: item.namespace,
                score: item.score,
            }
        })
        .filter(Boolean) as UserMemorySemanticSearchItem[]
}

function dedupeByStableKey(candidates: UserMemorySemanticCandidate[]): UserMemorySemanticCandidate[] {
    const deduped = new Map<string, UserMemorySemanticCandidate>()

    for (const candidate of candidates) {
        const existing = deduped.get(candidate.stableKey)

        if (!existing) {
            deduped.set(candidate.stableKey, candidate)
            continue
        }

        if (candidate.score > existing.score || candidate.document.updatedAt > existing.document.updatedAt) {
            deduped.set(candidate.stableKey, candidate)
        }
    }

    return [...deduped.values()]
}

function applyConflictHandling(candidates: UserMemorySemanticCandidate[]): UserMemorySemanticCandidate[] {
    const resolved = new Map<string, UserMemorySemanticCandidate>()

    for (const candidate of candidates) {
        const conflictKey = [
            candidate.document.type,
            normalizeSemanticText(candidate.document.identity.subject),
            normalizeSemanticText(candidate.document.identity.facet ?? ''),
        ].join(':')
        const existing = resolved.get(conflictKey)

        if (!existing) {
            resolved.set(conflictKey, candidate)
            continue
        }

        if (candidate.document.updatedAt > existing.document.updatedAt || candidate.score > existing.score) {
            resolved.set(conflictKey, candidate)
        }
    }

    return [...resolved.values()]
}

function selectFromSemanticCandidates(
    candidates: UserMemorySemanticCandidate[],
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): SelectedUserMemory[] {
    const selected: SelectedUserMemory[] = []
    let totalChars = 0

    for (const candidate of candidates) {
        if (selected.length >= config.maxSelectedMemories || totalChars >= config.maxTotalChars) {
            break
        }

        const text = clipUserMemoryText(candidate.document.text, config.maxMemoryChars)

        if (!text || totalChars + text.length > config.maxTotalChars) {
            continue
        }

        selected.push({
            score: candidate.score,
            stableKey: candidate.stableKey,
            tags: candidate.document.tags,
            text,
            type: candidate.document.type,
        })
        totalChars += text.length
    }

    return selected
}

function toVectorSemanticCandidates(
    searchItems: UserMemorySemanticSearchItem[],
    latestUserText: string,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): UserMemorySemanticCandidate[] {
    return applyConflictHandling(
        dedupeByStableKey(
            searchItems
                .filter(item => isUserMemorySemanticEligible(item.document, config))
                .filter(item => typeof item.score === 'number' && Number.isFinite(item.score) && item.score >= 0 && item.score <= 1)
                .filter(item => (item.score ?? 0) >= config.semanticScoreThreshold)
                .filter(item => !hasCurrentInputConflict(item.document, normalizeSemanticText(latestUserText)))
                .map(item => ({
                    document: item.document,
                    score: item.score ?? 0,
                    stableKey: item.document.stableKey,
                }))
                .sort((left, right) => {
                    if (right.score !== left.score) {
                        return right.score - left.score
                    }

                    return right.document.updatedAt.localeCompare(left.document.updatedAt)
                })
        )
    )
}

async function vectorSemanticSearch(
    store: BaseStore,
    namespace: string[],
    normalizedQuery: string,
    limit: number
): Promise<UserMemorySemanticSearchItem[]> {
    const items = await (store as VectorSearchCapableStore).search(namespace, {
        limit,
        mode: 'vector',
        query: normalizedQuery,
    })

    return toSemanticSearchItems(items)
}

function withSemanticTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('USER_MEMORY_SEMANTIC_TIMEOUT'))
        }, timeoutMs)

        void promise.then(
            value => {
                clearTimeout(timeoutId)
                resolve(value)
            },
            error => {
                clearTimeout(timeoutId)
                reject(error)
            }
        )
    })
}

function isSemanticEligiblePath(path: UserMemoryPath): boolean {
    return path === 'ordinary_chat' || path === 'tool_assisted_ordinary_chat'
}

export function normalizeUserMemorySemanticQuery(
    latestUserText: string,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): string {
    return normalizeSemanticQuery(latestUserText, config)
}

export async function retrieveRelevantUserMemories(
    store: BaseStore,
    input: UserMemorySemanticRetrievalRequest,
    env: Record<string, string | undefined> = process.env,
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(env)
): Promise<SelectedUserMemory[]> {
    if (!input.sessionId?.trim() || !input.latestUserText.trim() || !isSemanticEligiblePath(input.path)) {
        return []
    }

    const normalizedQuery = normalizeSemanticQuery(input.latestUserText, config)

    if (!normalizedQuery) {
        return []
    }

    const namespace = buildUserMemoryNamespace(input.sessionId, env)

    try {
        const searchItems = await withSemanticTimeout(vectorSemanticSearch(store, namespace, normalizedQuery, input.limit), input.timeoutMs)

        const candidates = toVectorSemanticCandidates(searchItems, input.latestUserText, config)

        return selectFromSemanticCandidates(candidates, config)
    } catch (error) {
        logUserMemoryRetrievalEvent('semantic-retrieval-degraded', {
            degradationKind: error instanceof Error && error.message === 'USER_MEMORY_SEMANTIC_TIMEOUT' ? 'timeout' : 'failure',
            elapsedBudgetMs: input.timeoutMs,
            providerKind: config.semanticEmbeddingProviderKind,
            searchMode: 'vector',
            errorName: error instanceof Error ? error.name : 'UnknownError',
        })

        return []
    }
}
