import type { ChatExecutionContext, ChatSession, WriteChunk } from '../../types'
import type { TasklistAgentRuntimeConfig } from '../config/agent-runtime-config'

export interface VersionPlanTasklistGraphNodeRuntime {
    context: ChatExecutionContext
    model: ChatSession['baseModel']
    runtimeConfig: TasklistAgentRuntimeConfig
    userGoal: string
    writeChunk: WriteChunk
}
