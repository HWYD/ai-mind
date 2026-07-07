import { type BaseStore, InMemoryStore } from '@langchain/langgraph'
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store'

import { getUserMemoryRuntimeConfig, USER_MEMORY_POSTGRES_SCHEMA, type UserMemoryRuntimeConfig } from './runtime-config'

const userMemoryGlobal = globalThis as typeof globalThis & {
    __aiMindUserMemoryStore?: InMemoryStore
}

let postgresUserMemoryStore: PostgresStore | undefined
let postgresUserMemoryStoreConnectionString: string | undefined

function getMemoryUserMemoryStore(): InMemoryStore {
    userMemoryGlobal.__aiMindUserMemoryStore ??= new InMemoryStore()

    return userMemoryGlobal.__aiMindUserMemoryStore
}

export function createPostgresUserMemoryStore(connectionString: string, schema = USER_MEMORY_POSTGRES_SCHEMA): PostgresStore {
    if (!connectionString.trim()) {
        throw new Error('DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    }

    return PostgresStore.fromConnString(connectionString, { schema })
}

export function getUserMemoryStore(
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env
): BaseStore {
    if (config.storeMode === 'memory') {
        return getMemoryUserMemoryStore()
    }

    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    }

    if (postgresUserMemoryStore && postgresUserMemoryStoreConnectionString !== connectionString) {
        throw new Error('The process-level UserMemory Postgres store cannot switch DATABASE_URL at runtime.')
    }

    postgresUserMemoryStore ??= createPostgresUserMemoryStore(connectionString, config.postgresSchema)
    postgresUserMemoryStoreConnectionString = connectionString

    return postgresUserMemoryStore
}

export async function closeUserMemoryPostgresStore(): Promise<void> {
    if (!postgresUserMemoryStore) {
        return
    }

    await postgresUserMemoryStore.stop()
    postgresUserMemoryStore = undefined
    postgresUserMemoryStoreConnectionString = undefined
}

export function resetUserMemoryStoreForTests(): void {
    userMemoryGlobal.__aiMindUserMemoryStore = undefined
    postgresUserMemoryStore = undefined
    postgresUserMemoryStoreConnectionString = undefined
}
