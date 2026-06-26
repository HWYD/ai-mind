import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

try {
    await import('dotenv/config')
} catch {
    // Production runner images receive DATABASE_URL from Compose / server env,
    // so dotenv is optional for this one-shot setup script.
}

const connectionString = process.env.DATABASE_URL?.trim()

if (!connectionString) {
    throw new Error('DATABASE_URL is required to set up the LangGraph Postgres checkpointer.')
}

const checkpointer = PostgresSaver.fromConnString(connectionString, {
    schema: 'langgraph_checkpoint',
})

try {
    await checkpointer.setup()
    console.log('LangGraph Postgres checkpointer schema is ready.')
} finally {
    await checkpointer.end()
}
