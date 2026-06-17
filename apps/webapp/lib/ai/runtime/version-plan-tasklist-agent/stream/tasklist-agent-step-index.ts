import type { VersionPlanTasklistGraphStateAnnotationState } from '../graph/graph-state'

export function getNextStepIndex(state: VersionPlanTasklistGraphStateAnnotationState) {
    return state.execution.counters.steps + 1
}
