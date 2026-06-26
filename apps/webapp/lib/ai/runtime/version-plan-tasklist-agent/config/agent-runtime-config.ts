export type GraphEventsMode = 'off' | 'on'

export type GraphCheckpointMode = 'memory' | 'off' | 'postgres'

export type GraphDebugViewMode = 'off' | 'on'

export interface TasklistAgentRuntimeConfig {
    graphCheckpointMode: GraphCheckpointMode
    graphDebugViewEnabled: boolean
    graphEventsEnabled: boolean
}

type RuntimeEnv = Record<string, string | undefined>

export function getTasklistAgentRuntimeConfig(
    env: RuntimeEnv = process.env,
    nodeEnv: string | undefined = process.env.NODE_ENV
): TasklistAgentRuntimeConfig {
    const graphEventsEnabled = env.AI_MIND_GRAPH_EVENTS?.trim() === 'on'
    const graphDebugViewEnabled = env.AI_MIND_GRAPH_DEBUG_VIEW?.trim() === 'on'

    const checkpointMode = env.AI_MIND_GRAPH_CHECKPOINT?.trim()
    const graphCheckpointMode: GraphCheckpointMode =
        checkpointMode === 'memory' || checkpointMode === 'postgres'
            ? checkpointMode
            : checkpointMode === undefined || checkpointMode === ''
              ? nodeEnv === 'production'
                  ? 'postgres'
                  : 'memory'
              : 'off'

    return {
        graphCheckpointMode,
        graphDebugViewEnabled,
        graphEventsEnabled,
    }
}
