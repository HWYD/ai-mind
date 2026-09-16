export interface GeneralReActRuntimeConfig {
    actionDeadlineMs: number
    hardDeadlineMs: number
    maxActionModelCalls: number
    maxAnswerPhaseMs: number
    maxLogicalToolCalls: number
    maxModelCalls: number
    maxModelRetries: number
    maxNoProgressRounds: number
    maxObservationChars: number
    maxObservationCharsPerCall: number
    maxToolConcurrency: number
    maxToolRetries: number
    maxToolBearingActionRounds: number
    recursionLimit: number
    reservedAnswerModelCalls: number
    terminalReserveMs: number
}

export function createGeneralReActRuntimeConfig<T extends GeneralReActRuntimeConfig>(config: T): Readonly<T> {
    if (config.reservedAnswerModelCalls !== 1) {
        throw new RangeError('General ReAct requires exactly one reservedAnswerModelCalls for Answer.')
    }
    if (config.maxModelCalls !== config.maxActionModelCalls + config.reservedAnswerModelCalls) {
        throw new RangeError('maxModelCalls must equal maxActionModelCalls plus reservedAnswerModelCalls.')
    }
    if (config.maxActionModelCalls !== config.maxToolBearingActionRounds + 1) {
        throw new RangeError('maxActionModelCalls must reserve the final no-Tool Action decision.')
    }
    if (config.actionDeadlineMs + config.maxAnswerPhaseMs + config.terminalReserveMs > config.hardDeadlineMs) {
        throw new RangeError('Action, Answer, and terminal reserve must fit within hardDeadlineMs.')
    }

    return Object.freeze(config)
}

export const GENERAL_REACT_RUNTIME_DEFAULTS = createGeneralReActRuntimeConfig({
    actionDeadlineMs: 145_000,
    hardDeadlineMs: 180_000,
    maxActionModelCalls: 7,
    maxAnswerPhaseMs: 30_000,
    maxLogicalToolCalls: 9,
    maxModelCalls: 8,
    maxModelRetries: 1,
    maxNoProgressRounds: 2,
    maxObservationChars: 32_000,
    maxObservationCharsPerCall: 12_000,
    maxToolConcurrency: 3,
    maxToolRetries: 4,
    maxToolBearingActionRounds: 6,
    recursionLimit: 16,
    reservedAnswerModelCalls: 1,
    terminalReserveMs: 5_000,
} as const)
