export type ContextBudgetEnvironment = 'cloud' | 'ollama'

export interface ContextBudget {
    compactionTriggerTokens: number
    effectiveWindowTokens: number
    hardInputTokens: number
    maxOutputTokens: number
    operationalCapTokens: number
    physicalWindowTokens: number
    postCompactionTargetTokens: number
    runtimeReserveTokens: number
}

export interface ContextBudgetInput {
    environment: ContextBudgetEnvironment
    maxOutputTokens: number
    operationalCapTokens: number
    physicalWindowTokens: number
}

export class ContextBudgetError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ContextBudgetError'
    }
}

export function deriveContextBudget(input: ContextBudgetInput): ContextBudget {
    assertPositiveInteger(input.physicalWindowTokens, 'physicalWindowTokens')
    assertPositiveInteger(input.operationalCapTokens, 'operationalCapTokens')
    assertPositiveInteger(input.maxOutputTokens, 'maxOutputTokens')

    const effectiveWindowTokens = Math.min(input.physicalWindowTokens, input.operationalCapTokens)
    const runtimeReserveTokens = Math.max(8192, Math.ceil(effectiveWindowTokens * 0.1))
    const hardInputTokens = effectiveWindowTokens - input.maxOutputTokens - runtimeReserveTokens

    if (hardInputTokens <= 0) {
        throw new ContextBudgetError('Context budget has no remaining input budget.')
    }

    const compactionTriggerTokens = Math.floor(hardInputTokens * 0.7)
    const postCompactionTargetTokens = Math.floor(hardInputTokens * 0.35)

    return {
        compactionTriggerTokens,
        effectiveWindowTokens,
        hardInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        operationalCapTokens: input.operationalCapTokens,
        physicalWindowTokens: input.physicalWindowTokens,
        postCompactionTargetTokens,
        runtimeReserveTokens,
    }
}

function assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new ContextBudgetError(`${name} must be a positive safe integer.`)
    }
}
