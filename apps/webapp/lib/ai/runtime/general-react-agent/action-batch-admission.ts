import { z } from 'zod'

import { GENERAL_REACT_RUNTIME_DEFAULTS } from './runtime-config'

const nonNegativeInteger = z.number().int().nonnegative()

export const callAdmissionSchema = z
    .object({
        admitted: z.boolean(),
        blockedReason: z.enum(['tool_call_limit', 'observation_limit']).nullable(),
        observationCharAllowance: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationCharsPerCall),
        ordinal: z.number().int().positive(),
    })
    .strict()

export const actionBatchAdmissionSchema = z
    .object({
        actionRound: z.number().int().positive(),
        admissions: z.record(z.string().min(1), callAdmissionSchema),
        batchId: z.string().min(1),
        orderedCallIds: z.array(z.string().min(1)).min(1),
        reservedObservationChars: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars),
        reservedToolCallCount: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls),
    })
    .strict()

const actionBatchAdmissionInputSchema = z
    .object({
        actionRound: z.number().int().positive(),
        batchId: z.string().min(1),
        callIds: z.array(z.string().min(1)).min(1),
        observationCharsUsed: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars),
        toolCallsUsed: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls),
    })
    .strict()

export type CallAdmission = z.infer<typeof callAdmissionSchema>
export type ActionBatchAdmission = z.infer<typeof actionBatchAdmissionSchema>
export type ActionBatchAdmissionInput = z.input<typeof actionBatchAdmissionInputSchema>

export function sumNonNegativeDelta(current: number, delta: number): number {
    if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(delta) || delta < 0) {
        throw new TypeError('State counters only accept non-negative safe integer deltas')
    }

    const total = current + delta

    if (!Number.isSafeInteger(total)) {
        throw new RangeError('State counter exceeded the safe integer range')
    }

    return total
}

export function mergeStringUnion(current: readonly string[], delta: readonly string[]): string[] {
    return [...new Set([...current, ...delta])].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

export function mergeKeyedUnion<T>(
    current: readonly T[],
    delta: readonly T[],
    getKey: (value: T) => string,
    resolveConflict: (left: T, right: T) => T
): T[] {
    const merged = new Map<string, T>()

    for (const value of [...current, ...delta]) {
        const key = getKey(value)

        if (!key) {
            throw new TypeError('Keyed state union requires a non-empty key')
        }

        const previous = merged.get(key)
        merged.set(key, previous === undefined ? value : resolveConflict(previous, value))
    }

    return [...merged.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([, value]) => value)
}

export function createActionBatchAdmission(input: ActionBatchAdmissionInput): Readonly<ActionBatchAdmission> {
    const parsed = actionBatchAdmissionInputSchema.parse(input)

    if (new Set(parsed.callIds).size !== parsed.callIds.length) {
        throw new TypeError('Action batch callIds must be unique')
    }

    const remainingToolCallSlots = GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls - parsed.toolCallsUsed
    const toolEligibleCallCount = Math.min(parsed.callIds.length, remainingToolCallSlots)
    const remainingObservationChars = GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars - parsed.observationCharsUsed
    const observationReservationCap = Math.min(
        remainingObservationChars,
        toolEligibleCallCount * GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationCharsPerCall
    )
    const baseAllowance = toolEligibleCallCount === 0 ? 0 : Math.floor(observationReservationCap / toolEligibleCallCount)
    const allowanceRemainder = observationReservationCap - baseAllowance * toolEligibleCallCount
    const admissions: Record<string, CallAdmission> = {}
    let reservedObservationChars = 0
    let reservedToolCallCount = 0

    parsed.callIds.forEach((callId, index) => {
        const ordinal = index + 1

        if (index >= toolEligibleCallCount) {
            admissions[callId] = Object.freeze({
                admitted: false,
                blockedReason: 'tool_call_limit',
                observationCharAllowance: 0,
                ordinal,
            })
            return
        }

        const observationCharAllowance = baseAllowance + (index < allowanceRemainder ? 1 : 0)

        if (observationCharAllowance === 0) {
            admissions[callId] = Object.freeze({
                admitted: false,
                blockedReason: 'observation_limit',
                observationCharAllowance: 0,
                ordinal,
            })
            return
        }

        reservedObservationChars += observationCharAllowance
        reservedToolCallCount += 1
        admissions[callId] = Object.freeze({
            admitted: true,
            blockedReason: null,
            observationCharAllowance,
            ordinal,
        })
    })

    const orderedCallIds = [...parsed.callIds]
    Object.freeze(admissions)
    Object.freeze(orderedCallIds)

    return Object.freeze({
        actionRound: parsed.actionRound,
        admissions,
        batchId: parsed.batchId,
        orderedCallIds,
        reservedObservationChars,
        reservedToolCallCount,
    })
}
