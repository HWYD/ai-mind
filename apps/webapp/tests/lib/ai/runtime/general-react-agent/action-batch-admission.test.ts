import { ReducedValue } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'

import {
    createActionBatchAdmission,
    mergeKeyedUnion,
    mergeStringUnion,
    sumNonNegativeDelta,
} from '@/lib/ai/runtime/general-react-agent/action-batch-admission'
import { generalReActAgentStateSchema } from '@/lib/ai/runtime/general-react-agent/agent-state'

describe('General ReAct action batch admission', () => {
    it('reserves four logical calls and deterministically shares the observation budget by ordinal', () => {
        const admission = createActionBatchAdmission({
            actionRound: 1,
            batchId: 'batch-1',
            callIds: ['call-1', 'call-2', 'call-3', 'call-4'],
            observationCharsUsed: 0,
            toolCallsUsed: 0,
        })

        expect(admission.orderedCallIds).toEqual(['call-1', 'call-2', 'call-3', 'call-4'])
        expect(admission.reservedToolCallCount).toBe(4)
        expect(admission.reservedObservationChars).toBe(48_000)
        expect(admission.admissions).toEqual({
            'call-1': {
                admitted: true,
                blockedReason: null,
                observationCharAllowance: 12_000,
                ordinal: 1,
            },
            'call-2': {
                admitted: true,
                blockedReason: null,
                observationCharAllowance: 12_000,
                ordinal: 2,
            },
            'call-3': {
                admitted: true,
                blockedReason: null,
                observationCharAllowance: 12_000,
                ordinal: 3,
            },
            'call-4': {
                admitted: true,
                blockedReason: null,
                observationCharAllowance: 12_000,
                ordinal: 4,
            },
        })
        expect(Object.isFrozen(admission)).toBe(true)
        expect(Object.isFrozen(admission.orderedCallIds)).toBe(true)
        expect(Object.values(admission.admissions).every(Object.isFrozen)).toBe(true)
    })

    it('reserves only remaining logical-call slots and marks overflow without provider eligibility', () => {
        const admission = createActionBatchAdmission({
            actionRound: 4,
            batchId: 'batch-last-slot',
            callIds: ['call-9', 'call-10', 'call-11'],
            observationCharsUsed: 30_000,
            toolCallsUsed: 12,
        })

        expect(admission.reservedToolCallCount).toBe(2)
        expect(admission.reservedObservationChars).toBe(18_000)
        expect(admission.admissions['call-9']).toMatchObject({
            admitted: true,
            blockedReason: null,
            observationCharAllowance: 9_000,
            ordinal: 1,
        })
        expect(admission.admissions['call-10']).toMatchObject({
            admitted: true,
            blockedReason: null,
            observationCharAllowance: 9_000,
            ordinal: 2,
        })
        expect(admission.admissions['call-11']).toMatchObject({
            admitted: false,
            blockedReason: 'tool_call_limit',
            observationCharAllowance: 0,
            ordinal: 3,
        })
    })

    it('blocks calls that cannot receive any observation allowance', () => {
        const admission = createActionBatchAdmission({
            actionRound: 2,
            batchId: 'batch-observation-limit',
            callIds: ['call-a', 'call-b'],
            observationCharsUsed: 47_999,
            toolCallsUsed: 0,
        })

        expect(admission.admissions['call-a']).toMatchObject({
            admitted: true,
            blockedReason: null,
            observationCharAllowance: 1,
        })
        expect(admission.admissions['call-b']).toMatchObject({
            admitted: false,
            blockedReason: 'observation_limit',
            observationCharAllowance: 0,
        })
        expect(admission.reservedToolCallCount).toBe(1)
        expect(admission.reservedObservationChars).toBe(1)
    })

    it('rejects duplicate or invalid call identities before parallel dispatch', () => {
        expect(() =>
            createActionBatchAdmission({
                actionRound: 1,
                batchId: 'batch-duplicate',
                callIds: ['same-call', 'same-call'],
                observationCharsUsed: 0,
                toolCallsUsed: 0,
            })
        ).toThrow('unique')
        expect(() =>
            createActionBatchAdmission({
                actionRound: 1,
                batchId: 'batch-empty',
                callIds: [],
                observationCharsUsed: 0,
                toolCallsUsed: 0,
            })
        ).toThrow()
    })
})

describe('General ReAct parallel state reducers', () => {
    it('sums validated non-negative deltas without check-then-increment state', () => {
        expect(sumNonNegativeDelta(4, 3)).toBe(7)
        expect(() => sumNonNegativeDelta(4, -1)).toThrow()
    })

    it('produces associative, commutative and idempotent string unions', () => {
        const leftThenRight = mergeStringUnion(['beta', 'alpha'], ['gamma', 'alpha'])
        const rightThenLeft = mergeStringUnion(['gamma', 'alpha'], ['beta', 'alpha'])

        expect(leftThenRight).toEqual(['alpha', 'beta', 'gamma'])
        expect(rightThenLeft).toEqual(leftThenRight)
        expect(mergeStringUnion(leftThenRight, leftThenRight)).toEqual(leftThenRight)
    })

    it('merges keyed deltas with a deterministic conflict resolver and stable key order', () => {
        const statusRank = { discovered: 0, read: 1 } as const
        const mergeSources = (left: { status: keyof typeof statusRank; url: string }, right: typeof left) =>
            statusRank[left.status] >= statusRank[right.status] ? left : right
        const first = [
            { status: 'discovered' as const, url: 'https://b.example' },
            { status: 'read' as const, url: 'https://a.example' },
        ]
        const second = [{ status: 'read' as const, url: 'https://b.example' }]

        expect(mergeKeyedUnion(first, second, item => item.url, mergeSources)).toEqual([
            { status: 'read', url: 'https://a.example' },
            { status: 'read', url: 'https://b.example' },
        ])
        expect(mergeKeyedUnion(second, first, item => item.url, mergeSources)).toEqual([
            { status: 'read', url: 'https://a.example' },
            { status: 'read', url: 'https://b.example' },
        ])
    })

    it('wires URL, source and fingerprint collections as ReducedValue fields', () => {
        expect(ReducedValue.isInstance(generalReActAgentStateSchema.fields._authorizedUrls)).toBe(true)
        expect(ReducedValue.isInstance(generalReActAgentStateSchema.fields._sources)).toBe(true)
        expect(ReducedValue.isInstance(generalReActAgentStateSchema.fields._callFingerprints)).toBe(true)
    })
})
