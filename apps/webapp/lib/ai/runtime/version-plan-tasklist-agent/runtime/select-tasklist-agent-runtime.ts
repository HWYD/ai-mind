import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import { getTasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { VersionPlanTasklistAgentInvocation } from '../index'

export type TasklistAgentRuntimeSelection =
    | {
          config: TasklistAgentRuntimeConfig
          runtimeMode: 'graph'
      }
    | {
          config: TasklistAgentRuntimeConfig
          runtimeMode: 'legacy'
      }

export function selectTasklistAgentRuntime(
    invocation: VersionPlanTasklistAgentInvocation | null,
    config: TasklistAgentRuntimeConfig = getTasklistAgentRuntimeConfig()
): TasklistAgentRuntimeSelection | null {
    if (invocation?.kind !== 'ready') {
        return null
    }

    return {
        config,
        runtimeMode: config.runtimeMode,
    }
}
