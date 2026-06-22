import type { ChatExecutionContext, WriteChunk } from '../../types'
import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'
import type { TasklistAgentModelSet } from '../model/tasklist-agent-model-set'

export interface VersionPlanTasklistGraphNodeRuntime {
    context: ChatExecutionContext
    models: TasklistAgentModelSet
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
    writeChunk: WriteChunk
}
