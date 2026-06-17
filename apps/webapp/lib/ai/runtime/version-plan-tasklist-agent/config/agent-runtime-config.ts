export type GraphEventsMode = 'off' | 'on'

export type GraphCheckpointMode = 'memory' | 'off'

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

    // memory checkpoint 仅作为展示和调试能力开关，由显式 env 控制。
    const graphCheckpointMode: GraphCheckpointMode = env.AI_MIND_GRAPH_CHECKPOINT?.trim() === 'memory' ? 'memory' : 'off'

    return {
        graphCheckpointMode,
        graphDebugViewEnabled,
        graphEventsEnabled,
    }
}
