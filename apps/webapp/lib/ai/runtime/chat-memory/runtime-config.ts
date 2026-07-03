export type ChatMemoryCheckpointMode = 'memory' | 'off' | 'postgres'

export interface ChatMemoryRuntimeConfig {
    checkpointMode: ChatMemoryCheckpointMode
}

export function getChatMemoryRuntimeConfig(
    env: Record<string, string | undefined> = process.env,
    nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV
): ChatMemoryRuntimeConfig {
    const value = env.AI_MIND_CHAT_MEMORY_CHECKPOINT?.trim()

    if (value === 'off' || value === 'memory' || value === 'postgres') {
        return {
            checkpointMode: value,
        }
    }

    if (value) {
        return {
            checkpointMode: 'off',
        }
    }

    return {
        checkpointMode: nodeEnv === 'production' ? 'postgres' : 'memory',
    }
}
