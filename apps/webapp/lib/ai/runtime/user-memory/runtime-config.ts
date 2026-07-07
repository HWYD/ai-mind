export type UserMemoryStoreMode = 'memory' | 'postgres'

export interface UserMemoryRuntimeConfig {
    storeMode: UserMemoryStoreMode
    postgresSchema: string
    minConfidence: number
    maxSelectedMemories: number
    maxMemoryChars: number
    maxTotalChars: number
}

export const USER_MEMORY_POSTGRES_SCHEMA = 'langgraph_user_memory'
export const USER_MEMORY_SCHEMA_VERSION = 'user-memory.v1'
export const USER_MEMORY_MIN_CONFIDENCE = 0.7
export const USER_MEMORY_MAX_SELECTED_MEMORIES = 3
export const USER_MEMORY_MAX_TEXT_CHARS = 300
export const USER_MEMORY_MAX_TOTAL_CHARS = 900

function resolveDefaultStoreMode(nodeEnv: string | undefined): UserMemoryStoreMode {
    return nodeEnv === 'production' ? 'postgres' : 'memory'
}

export function getUserMemoryRuntimeConfig(
    env: Record<string, string | undefined> = process.env,
    nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV
): UserMemoryRuntimeConfig {
    const configuredMode = env.AI_MIND_USER_MEMORY_STORE?.trim()
    const defaultStoreMode = resolveDefaultStoreMode(nodeEnv)

    return {
        storeMode: configuredMode === 'memory' || configuredMode === 'postgres' ? configuredMode : defaultStoreMode,
        postgresSchema: USER_MEMORY_POSTGRES_SCHEMA,
        minConfidence: USER_MEMORY_MIN_CONFIDENCE,
        maxSelectedMemories: USER_MEMORY_MAX_SELECTED_MEMORIES,
        maxMemoryChars: USER_MEMORY_MAX_TEXT_CHARS,
        maxTotalChars: USER_MEMORY_MAX_TOTAL_CHARS,
    }
}
