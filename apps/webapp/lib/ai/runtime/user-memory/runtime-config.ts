export type UserMemoryStoreMode = 'postgres'
export type UserMemorySemanticProviderKind = 'volcengine-ark-doubao-openai-compatible'

export const USER_MEMORY_EMBEDDING_DIMENSIONS_ENV = 'AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS'
export const USER_MEMORY_EMBEDDING_MODEL_ID = 'doubao-embedding-vision'
export const USER_MEMORY_SEMANTIC_INDEX_FIELDS = ['text', 'tags'] as const
export type UserMemorySemanticIndexField = (typeof USER_MEMORY_SEMANTIC_INDEX_FIELDS)[number]
export const USER_MEMORY_SEMANTIC_INDEX_VERSION = 'user-memory-semantic.v3'
export const USER_MEMORY_SEMANTIC_PROVIDER_KIND_REAL = 'volcengine-ark-doubao-openai-compatible'

export interface UserMemoryRuntimeConfig {
    storeMode: UserMemoryStoreMode
    postgresSchema: string
    minConfidence: number
    maxSelectedMemories: number
    maxMemoryChars: number
    maxTotalChars: number
    semanticEmbeddingDimensions?: number
    semanticEmbeddingModelId: string
    semanticEmbeddingProviderKind: UserMemorySemanticProviderKind
    semanticIndexFields: readonly UserMemorySemanticIndexField[]
    semanticIndexVersion: string
    semanticQueryHeadChars: number
    semanticQueryMaxChars: number
    semanticQueryTailChars: number
    semanticScoreThreshold: number
    semanticTimeoutMs: number
    semanticTopK: number
}

export const USER_MEMORY_POSTGRES_SCHEMA = 'langgraph_user_memory'
export const USER_MEMORY_SCHEMA_VERSION = 'user-memory.v1'
export const USER_MEMORY_MIN_CONFIDENCE = 0.7
export const USER_MEMORY_MAX_SELECTED_MEMORIES = 3
export const USER_MEMORY_MAX_TEXT_CHARS = 300
export const USER_MEMORY_MAX_TOTAL_CHARS = 900
export const USER_MEMORY_SEMANTIC_SCORE_THRESHOLD = 0.32
export const USER_MEMORY_SEMANTIC_TIMEOUT_MS = 1500
export const USER_MEMORY_SEMANTIC_TOP_K = 8
export const USER_MEMORY_SEMANTIC_QUERY_MAX_CHARS = 800
export const USER_MEMORY_SEMANTIC_QUERY_HEAD_CHARS = 400
export const USER_MEMORY_SEMANTIC_QUERY_TAIL_CHARS = 400

function resolveDefaultStoreMode(_nodeEnv: string | undefined): UserMemoryStoreMode {
    return 'postgres'
}

function readOptionalPositiveInteger(rawValue: string | undefined): number | undefined {
    const value = rawValue?.trim()

    if (!value) {
        return undefined
    }

    const parsed = Number(value)

    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function getUserMemoryRuntimeConfig(
    env: Record<string, string | undefined> = process.env,
    nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV
): UserMemoryRuntimeConfig {
    const configuredMode = env.AI_MIND_USER_MEMORY_STORE?.trim()
    const defaultStoreMode = resolveDefaultStoreMode(nodeEnv)
    const storeMode = configuredMode === 'postgres' ? configuredMode : defaultStoreMode
    const semanticEmbeddingDimensions = readOptionalPositiveInteger(env[USER_MEMORY_EMBEDDING_DIMENSIONS_ENV])

    return {
        storeMode,
        postgresSchema: USER_MEMORY_POSTGRES_SCHEMA,
        minConfidence: USER_MEMORY_MIN_CONFIDENCE,
        maxSelectedMemories: USER_MEMORY_MAX_SELECTED_MEMORIES,
        maxMemoryChars: USER_MEMORY_MAX_TEXT_CHARS,
        maxTotalChars: USER_MEMORY_MAX_TOTAL_CHARS,
        semanticEmbeddingDimensions,
        semanticEmbeddingModelId: USER_MEMORY_EMBEDDING_MODEL_ID,
        semanticEmbeddingProviderKind: USER_MEMORY_SEMANTIC_PROVIDER_KIND_REAL,
        semanticIndexFields: USER_MEMORY_SEMANTIC_INDEX_FIELDS,
        semanticIndexVersion: USER_MEMORY_SEMANTIC_INDEX_VERSION,
        semanticQueryHeadChars: USER_MEMORY_SEMANTIC_QUERY_HEAD_CHARS,
        semanticQueryMaxChars: USER_MEMORY_SEMANTIC_QUERY_MAX_CHARS,
        semanticQueryTailChars: USER_MEMORY_SEMANTIC_QUERY_TAIL_CHARS,
        semanticScoreThreshold: USER_MEMORY_SEMANTIC_SCORE_THRESHOLD,
        semanticTimeoutMs: USER_MEMORY_SEMANTIC_TIMEOUT_MS,
        semanticTopK: USER_MEMORY_SEMANTIC_TOP_K,
    }
}
