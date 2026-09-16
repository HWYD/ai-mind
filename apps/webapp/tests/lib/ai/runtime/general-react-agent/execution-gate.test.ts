import { describe, expect, it } from 'vitest'

import { GeneralReActExecutionGate, generalReActExecutionGate } from '@/lib/ai/runtime/general-react-agent/execution-gate'

describe('GeneralReActExecutionGate', () => {
    it('admits eight runs synchronously and fails the ninth without a wait queue', () => {
        const gate = new GeneralReActExecutionGate()
        const permits = Array.from({ length: 8 }, () => gate.tryAcquire())

        expect(permits.every(Boolean)).toBe(true)
        expect(gate.activeCount()).toBe(8)
        expect(gate.tryAcquire()).toBeNull()
        expect(gate.activeCount()).toBe(8)
        expect(gate.tryAcquire()).not.toBeInstanceOf(Promise)
    })

    it('releases capacity exactly once even when a permit owner calls release repeatedly', () => {
        const gate = new GeneralReActExecutionGate()
        const permit = gate.tryAcquire()

        expect(permit).not.toBeNull()
        expect(gate.activeCount()).toBe(1)

        permit?.release()
        permit?.release()

        expect(gate.activeCount()).toBe(0)
    })

    it('does not accept or retain request, user or session payload', () => {
        const gate = new GeneralReActExecutionGate()

        expect(gate.tryAcquire.length).toBe(0)
        expect(Object.keys(gate)).toEqual([])
        expect(JSON.stringify(gate)).toBe('{}')
    })

    it('exports one process-scoped singleton without exposing mutable capacity state', () => {
        expect(generalReActExecutionGate).toBeInstanceOf(GeneralReActExecutionGate)
        expect(Object.isFrozen(generalReActExecutionGate)).toBe(true)
    })
})
