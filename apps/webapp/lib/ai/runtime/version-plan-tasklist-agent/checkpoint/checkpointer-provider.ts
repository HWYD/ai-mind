import { type BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

import type { GraphCheckpointMode } from '../config/agent-runtime-config'

export const VERSION_PLAN_TASKLIST_CHECKPOINT_SCHEMA = 'langgraph_checkpoint'

const memoryCheckpointer = new MemorySaver()
let postgresCheckpointer: PostgresSaver | undefined
let postgresCheckpointerConnectionString: string | undefined

export function createPostgresTasklistCheckpointer(connectionString: string): PostgresSaver {
    if (!connectionString.trim()) {
        throw new Error('DATABASE_URL is required when AI_MIND_GRAPH_CHECKPOINT=postgres.')
    }

    return PostgresSaver.fromConnString(connectionString, {
        schema: VERSION_PLAN_TASKLIST_CHECKPOINT_SCHEMA,
    })
}

export function getVersionPlanTasklistCheckpointer(
    mode: GraphCheckpointMode,
    env: Record<string, string | undefined> = process.env
): BaseCheckpointSaver | undefined {
    if (mode === 'off') {
        return undefined
    }

    if (mode === 'memory') {
        return memoryCheckpointer
    }

    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required when AI_MIND_GRAPH_CHECKPOINT=postgres.')
    }

    if (postgresCheckpointer && postgresCheckpointerConnectionString !== connectionString) {
        throw new Error('The process-level Postgres checkpointer cannot switch DATABASE_URL at runtime.')
    }

    postgresCheckpointer ??= createPostgresTasklistCheckpointer(connectionString)
    postgresCheckpointerConnectionString = connectionString

    return postgresCheckpointer
}

export async function closeVersionPlanTasklistPostgresCheckpointer(): Promise<void> {
    if (!postgresCheckpointer) {
        return
    }

    await postgresCheckpointer.end()
    postgresCheckpointer = undefined
    postgresCheckpointerConnectionString = undefined
}
