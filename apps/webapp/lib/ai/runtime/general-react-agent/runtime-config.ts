export interface GeneralReActRuntimeConfig {
    preFinalizationDeadlineMs: number
    loopDeadlineMs: number
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
    if (config.loopDeadlineMs + config.terminalReserveMs !== config.preFinalizationDeadlineMs) {
        throw new RangeError('loopDeadlineMs plus terminalReserveMs must equal preFinalizationDeadlineMs.')
    }

    return Object.freeze(config)
}

export const GENERAL_REACT_RUNTIME_DEFAULTS = createGeneralReActRuntimeConfig({
    preFinalizationDeadlineMs: 240_000,
    loopDeadlineMs: 235_000,
    maxLogicalToolCalls: 21,
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
