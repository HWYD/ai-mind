export type TasklistAgentRuntimeMode = 'graph' | 'legacy'

export type GraphEventsMode = 'off' | 'on'

export type GraphCheckpointMode = 'memory' | 'off'

export type GraphDebugViewMode = 'off' | 'on'

export interface TasklistAgentRuntimeConfig {
    graphCheckpointMode: GraphCheckpointMode
    graphDebugViewEnabled: boolean
    graphEventsEnabled: boolean
    runtimeMode: TasklistAgentRuntimeMode
}

type RuntimeEnv = Record<string, string | undefined>

export function getTasklistAgentRuntimeConfig(
    env: RuntimeEnv = process.env,
    nodeEnv: string | undefined = process.env.NODE_ENV
): TasklistAgentRuntimeConfig {
    // 迁移期默认 legacy，只有显式开启 graph 时才进入新编排路径，避免半成品 graph 影响现有 /tasklist 链路。
    const runtimeMode: TasklistAgentRuntimeMode = env.AI_MIND_TASKLIST_AGENT_RUNTIME?.trim() === 'graph' ? 'graph' : 'legacy'
    const graphRuntimeEnabled = runtimeMode === 'graph'

    // Graph 附加能力只在 graph runtime 下生效；legacy fallback 不应该发送 graph events 或暴露 debug 摘要。
    const graphEventsEnabled = graphRuntimeEnabled && env.AI_MIND_GRAPH_EVENTS?.trim() === 'on'
    const graphDebugViewEnabled = graphRuntimeEnabled && env.AI_MIND_GRAPH_DEBUG_VIEW?.trim() === 'on'

    // memory checkpoint 只用于开发态调试，production 下强制 off，避免被误解为可恢复的产品级状态。
    const graphCheckpointMode: GraphCheckpointMode =
        graphRuntimeEnabled && env.AI_MIND_GRAPH_CHECKPOINT?.trim() === 'memory' && nodeEnv !== 'production' ? 'memory' : 'off'

    return {
        graphCheckpointMode,
        graphDebugViewEnabled,
        graphEventsEnabled,
        runtimeMode,
    }
}
