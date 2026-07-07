import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store'

import { loadSetupDatabaseUrlFromEnvFiles } from './load-setup-env.mjs'

export const USER_MEMORY_SETUP_SUCCESS_MESSAGE = 'UserMemory LangGraph PostgresStore schema is ready.'
const USER_MEMORY_SETUP_SCHEMA = 'langgraph_user_memory'

function toSetupFailure(error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'

    return new Error(`UserMemory PostgresStore setup failed (${errorName}).`)
}

export async function runUserMemoryStoreSetup(options = {}) {
    const env = options.env ?? process.env
    const loadEnv = options.loadEnv ?? (() => loadSetupDatabaseUrlFromEnvFiles())
    const log = options.log ?? console.log
    const createStore =
        options.createStore ??
        ((connectionString, schema) =>
            PostgresStore.fromConnString(connectionString, {
                schema,
            }))

    loadEnv()

    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required to set up the UserMemory LangGraph Postgres store.')
    }

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
