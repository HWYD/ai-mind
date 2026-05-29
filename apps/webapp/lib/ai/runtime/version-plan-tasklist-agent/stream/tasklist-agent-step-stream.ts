import { createId } from '@/lib/ai/create-id'

import type { WriteChunk } from '../../types'
import type { VersionPlanTasklistAgentAction, VersionPlanTasklistAgentState } from '../contract/types'

interface AgentStepOptions {
    actionType: VersionPlanTasklistAgentAction['type']
    state: VersionPlanTasklistAgentState
    stepIndex: number
    title: string
    writeChunk: WriteChunk
}

export function getNextStepIndex(state: VersionPlanTasklistAgentState) {
    return state.counters.steps + 1
}

export function startAgentStep(options: AgentStepOptions) {
    const partId = createId()

    options.writeChunk({
        type: 'agent-step-start',
        partId,
        runId: options.state.runId,
        agentName: options.state.agentName,
        stepIndex: options.stepIndex,
        actionType: options.actionType,
        title: options.title,
    })

    return {
        partId,
        startedAt: Date.now(),
    }
}

export function endAgentStep(
    options: AgentStepOptions & {
        durationStartedAt: number
        error?: string
        partId: string
        severity?: 'error' | 'info' | 'warning'
        status?: 'completed' | 'failed' | 'skipped'
        summary?: string
        tags?: string[]
    }
) {
    options.writeChunk({
        type: 'agent-step-end',
        partId: options.partId,
        runId: options.state.runId,
        agentName: options.state.agentName,
        stepIndex: options.stepIndex,
        actionType: options.actionType,
        status: options.status ?? 'completed',
        title: options.title,
        summary: options.summary,
        durationMs: Date.now() - options.durationStartedAt,
        severity: options.severity ?? 'info',
        tags: options.tags,
        error: options.error,
    })
}
