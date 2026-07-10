import { type BaseStore } from '@langchain/langgraph'
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store'

import { getModelProviderConfig } from '@/lib/ai/model-provider'

import { createDoubaoEmbeddings, type DoubaoEmbeddings } from './doubao-embeddings'
import {
    getUserMemoryRuntimeConfig,
    USER_MEMORY_EMBEDDING_DIMENSIONS_ENV,
    USER_MEMORY_POSTGRES_SCHEMA,
    type UserMemoryRuntimeConfig,
} from './runtime-config'

interface CreatePostgresUserMemoryStoreOptions {
    config?: UserMemoryRuntimeConfig
    env?: Record<string, string | undefined>
}

let postgresUserMemoryStore: PostgresStore | undefined
let postgresUserMemoryStoreConnectionString: string | undefined
let postgresUserMemoryStoreKey: string | undefined

function readOptionalPositiveInteger(rawValue: string | undefined): number | undefined {
    const value = rawValue?.trim()

    if (!value) {
        return undefined
    }

    const parsed = Number(value)

    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function resolveSemanticEmbeddingDimensions(
    config: UserMemoryRuntimeConfig,
    env: Record<string, string | undefined> = process.env
): number {
    if (typeof config.semanticEmbeddingDimensions === 'number' && config.semanticEmbeddingDimensions > 0) {
        return config.semanticEmbeddingDimensions
    }

    const envDimensions = readOptionalPositiveInteger(env[USER_MEMORY_EMBEDDING_DIMENSIONS_ENV])

    if (typeof envDimensions === 'number') {
        return envDimensions
    }

    throw new Error(`${USER_MEMORY_EMBEDDING_DIMENSIONS_ENV} is required when AI_MIND_USER_MEMORY_STORE=postgres.`)
}

function createUserMemorySemanticEmbeddings(
    config: UserMemoryRuntimeConfig,
    env: Record<string, string | undefined> = process.env
): DoubaoEmbeddings {
    const providerConfig = getModelProviderConfig(env)
    const apiKey = providerConfig.doubao.apiKey?.trim()

    if (!apiKey) {
        throw new Error('AI_MIND_DOUBAO_API_KEY is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    }

    return createDoubaoEmbeddings({
        apiKey,
        dimensions: resolveSemanticEmbeddingDimensions(config, env),
        baseURL: providerConfig.doubao.baseURL,
        model: config.semanticEmbeddingModelId,
        timeoutMs: config.semanticTimeoutMs,
    })
}

function buildPostgresUserMemoryStoreKey(
    connectionString: string,
    config: UserMemoryRuntimeConfig,
    dimensions: number,
    env: Record<string, string | undefined>
): string {
    const providerConfig = getModelProviderConfig(env)

    return [
        connectionString,
        config.postgresSchema,
        dimensions,
        config.semanticEmbeddingModelId,
        config.semanticEmbeddingProviderKind,
        config.semanticIndexVersion,
        config.semanticIndexFields.join(','),
        providerConfig.doubao.baseURL.trim(),
    ].join('|')
}

export function createPostgresUserMemoryStore(
    connectionString: string,
    schema = USER_MEMORY_POSTGRES_SCHEMA,
    options: CreatePostgresUserMemoryStoreOptions = {}
): PostgresStore {
    if (!connectionString.trim()) {
        throw new Error('DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    }

    const env = options.env ?? process.env
    const config = options.config ?? getUserMemoryRuntimeConfig(env)
    const dimensions = resolveSemanticEmbeddingDimensions(config, env)
    const resolvedConfig =
        config.semanticEmbeddingDimensions === dimensions ? config : { ...config, semanticEmbeddingDimensions: dimensions }

    return PostgresStore.fromConnString(connectionString, {
        index: {
            dims: dimensions,
            distanceMetric: 'cosine',
            embed: createUserMemorySemanticEmbeddings(resolvedConfig, env),
            fields: [...config.semanticIndexFields],
        },
        schema,
    })
}

export function getUserMemoryStore(
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env
): BaseStore {
    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required when AI_MIND_USER_MEMORY_STORE=postgres.')
    }

    if (postgresUserMemoryStore && postgresUserMemoryStoreConnectionString !== connectionString) {
        throw new Error('The process-level UserMemory Postgres store cannot switch DATABASE_URL at runtime.')
    }

    const dimensions = resolveSemanticEmbeddingDimensions(config, env)
    const storeKey = buildPostgresUserMemoryStoreKey(connectionString, config, dimensions, env)

    if (postgresUserMemoryStore && postgresUserMemoryStoreKey !== storeKey) {
        void postgresUserMemoryStore.stop().catch(() => undefined)
        postgresUserMemoryStore = undefined
    }

    if (!postgresUserMemoryStore) {
        postgresUserMemoryStore = createPostgresUserMemoryStore(connectionString, config.postgresSchema, {
            config: {
                ...config,
                semanticEmbeddingDimensions: dimensions,
            },
            env,
        })
        postgresUserMemoryStoreKey = storeKey
    }
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
    postgresUserMemoryStoreKey = undefined
}

export function resetUserMemoryStoreForTests(): void {
    postgresUserMemoryStore = undefined
    postgresUserMemoryStoreConnectionString = undefined
    postgresUserMemoryStoreKey = undefined
}
