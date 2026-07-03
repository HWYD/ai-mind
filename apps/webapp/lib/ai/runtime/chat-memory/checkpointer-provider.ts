import { type BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

import type { ChatMemoryCheckpointMode } from './runtime-config'

export const CHAT_MEMORY_CHECKPOINT_SCHEMA = 'langgraph_chat_memory'

const chatMemoryGlobal = globalThis as typeof globalThis & {
    __aiMindChatMemorySaver?: MemorySaver
}
let postgresCheckpointer: PostgresSaver | undefined
let postgresCheckpointerConnectionString: string | undefined

function getMemoryChatMemoryCheckpointer(): MemorySaver {
    chatMemoryGlobal.__aiMindChatMemorySaver ??= new MemorySaver()

    return chatMemoryGlobal.__aiMindChatMemorySaver
}

export function createPostgresChatMemoryCheckpointer(connectionString: string): PostgresSaver {
    if (!connectionString.trim()) {
        throw new Error('DATABASE_URL is required when AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres.')
    }

    return PostgresSaver.fromConnString(connectionString, {
        schema: CHAT_MEMORY_CHECKPOINT_SCHEMA,
    })
}

export function getChatMemoryCheckpointer(
    mode: ChatMemoryCheckpointMode,
    env: Record<string, string | undefined> = process.env
): BaseCheckpointSaver | undefined {
    if (mode === 'off') {
        return undefined
    }

    if (mode === 'memory') {
        return getMemoryChatMemoryCheckpointer()
    }

    const connectionString = env.DATABASE_URL?.trim()

    if (!connectionString) {
        throw new Error('DATABASE_URL is required when AI_MIND_CHAT_MEMORY_CHECKPOINT=postgres.')
    }

    if (postgresCheckpointer && postgresCheckpointerConnectionString !== connectionString) {
        throw new Error('The process-level chat memory Postgres checkpointer cannot switch DATABASE_URL at runtime.')
    }

    postgresCheckpointer ??= createPostgresChatMemoryCheckpointer(connectionString)
    postgresCheckpointerConnectionString = connectionString

    return postgresCheckpointer
}

export async function closeChatMemoryPostgresCheckpointer(): Promise<void> {
    if (!postgresCheckpointer) {
        return
    }

    await postgresCheckpointer.end()
    postgresCheckpointer = undefined
    postgresCheckpointerConnectionString = undefined
}
