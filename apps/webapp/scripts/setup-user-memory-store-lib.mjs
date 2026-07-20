import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store'

import { loadSetupEnvFiles } from './load-setup-env.mjs'

export const USER_MEMORY_SETUP_SUCCESS_MESSAGE = 'UserMemory LangGraph PostgresStore schema is ready.'
const USER_MEMORY_SETUP_SCHEMA = 'langgraph_user_memory'
const USER_MEMORY_EMBEDDING_DIMENSIONS_ENV = 'AI_MIND_USER_MEMORY_EMBEDDING_DIMENSIONS'
const USER_MEMORY_SEMANTIC_INDEX_FIELDS = ['text', 'tags']

function createDeterministicSetupEmbeddings(dimensions) {
    return {
        async embedDocuments(texts) {
            return texts.map(() => new Array(dimensions).fill(0))
        },

        async embedQuery() {
            return new Array(dimensions).fill(0)
        },
    }
}

function toSetupFailure(error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'

    return new Error(`UserMemory PostgresStore setup failed (${errorName}).`)
}

export async function runUserMemoryStoreSetup(options = {}) {
    const env = options.env ?? process.env
    const loadEnv = options.loadEnv ?? (() => loadSetupEnvFiles())
    const log = options.log ?? console.log

    loadEnv()

    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required to set up the UserMemory LangGraph Postgres store.')
    }

    const dimensions = Number(env[USER_MEMORY_EMBEDDING_DIMENSIONS_ENV]?.trim())

    if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error(`${USER_MEMORY_EMBEDDING_DIMENSIONS_ENV} is required to set up the UserMemory LangGraph Postgres store.`)
    }

    const createStore =
        options.createStore ??
        ((resolvedConnectionString, schema) =>
            PostgresStore.fromConnString(resolvedConnectionString, {
                index: {
                    dims: dimensions,
                    distanceMetric: 'cosine',
                    embed: createDeterministicSetupEmbeddings(dimensions),
                    fields: USER_MEMORY_SEMANTIC_INDEX_FIELDS,
                },
                schema,
            }))

    let store
    let setupError = null

    try {
        store = createStore(connectionString, USER_MEMORY_SETUP_SCHEMA)
        await store.setup()
        log(USER_MEMORY_SETUP_SUCCESS_MESSAGE)
    } catch (error) {
        setupError = error
    } finally {
        if (store?.stop) {
            try {
                await store.stop()
            } catch (error) {
                setupError ??= error
            }
        }
    }

    if (setupError) {
        throw toSetupFailure(setupError)
    }
}

export function resolveUserMemorySetupDimensions(env = process.env) {
    const dimensions = Number(env[USER_MEMORY_EMBEDDING_DIMENSIONS_ENV]?.trim())

    if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new Error(`${USER_MEMORY_EMBEDDING_DIMENSIONS_ENV} is required to set up the UserMemory LangGraph Postgres store.`)
    }

    return dimensions
}
