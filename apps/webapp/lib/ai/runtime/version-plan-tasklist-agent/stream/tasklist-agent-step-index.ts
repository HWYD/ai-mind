import type { VersionPlanTasklistAgentState } from '../contract/types'

export function getNextStepIndex(state: VersionPlanTasklistAgentState) {
    return state.counters.steps + 1
}
