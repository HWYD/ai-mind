export interface GeneralReActRuntimeConfig {
    hardDeadlineMs: number
    loopDeadlineMs: number
    maxFinalizerMs: number
    maxLogicalToolCalls: number
    maxLoopModelCalls: number
    maxModelCalls: number
    maxModelRetries: number
    maxNoProgressRounds: number
    maxObservationChars: number
    maxObservationCharsPerCall: number
    maxToolConcurrency: number
    maxToolRetries: number
    maxToolBearingRounds: number
    recursionLimit: number
    reservedFinalizerModelCalls: number
    terminalReserveMs: number
}

export function createGeneralReActRuntimeConfig<T extends GeneralReActRuntimeConfig>(config: T): Readonly<T> {
    if (config.reservedFinalizerModelCalls !== 1) {
        throw new RangeError('General ReAct requires exactly one reservedFinalizerModelCalls.')
    }
    if (config.maxModelCalls !== config.maxLoopModelCalls + config.reservedFinalizerModelCalls) {
        throw new RangeError('maxModelCalls must equal maxLoopModelCalls plus reservedFinalizerModelCalls.')
    }
    if (config.maxLoopModelCalls !== config.maxToolBearingRounds + 1) {
        throw new RangeError('maxLoopModelCalls must reserve the final no-Tool loop decision.')
    }
    if (config.loopDeadlineMs + config.maxFinalizerMs + config.terminalReserveMs !== config.hardDeadlineMs) {
        throw new RangeError('Loop, finalizer, and terminal reserve must equal hardDeadlineMs.')
    }

    return Object.freeze(config)
}

export const GENERAL_REACT_RUNTIME_DEFAULTS = createGeneralReActRuntimeConfig({
    hardDeadlineMs: 270_000,
    loopDeadlineMs: 235_000,
    maxFinalizerMs: 30_000,
    maxLogicalToolCalls: 14,
    maxLoopModelCalls: 10,
    maxModelCalls: 11,
    maxModelRetries: 1,
    maxNoProgressRounds: 2,
    maxObservationChars: 48_000,
    maxObservationCharsPerCall: 12_000,
    maxToolConcurrency: 3,
    maxToolRetries: 4,
    maxToolBearingRounds: 9,
    recursionLimit: 24,
    reservedFinalizerModelCalls: 1,
    terminalReserveMs: 5_000,
} as const)
