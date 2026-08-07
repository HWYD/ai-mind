import { describe, expect, it } from 'vitest'

import { DesktopHostStateMachine } from '../../src/main/host-state'

describe('desktop host state', () => {
    it('gives each compatibility attempt one five-second deadline', () => {
        const host = new DesktopHostStateMachine(1_000)
        const attempt = host.startCompatibilityCheck(2_000)

        expect(attempt).toEqual({ attemptId: 1, deadlineAt: 7_000 })
        expect(host.snapshot).toMatchObject({
            activeWindow: null,
            attemptId: 1,
            deadlineAt: 7_000,
            phase: 'checking_compatibility',
        })
    })

    it('rejects stale callbacks and callbacks after the shared deadline', () => {
        const host = new DesktopHostStateMachine(0)
        const first = host.startCompatibilityCheck(0)
        const second = host.startCompatibilityCheck(100)

        expect(host.canApplyAttempt(first.attemptId, 100)).toBe(false)
        expect(host.canApplyAttempt(second.attemptId, 5_100)).toBe(false)
        expect(host.canApplyAttempt(second.attemptId, 5_099)).toBe(true)
    })

    it('does not let an invalidated attempt leave recovery', () => {
        const host = new DesktopHostStateMachine(0)
        const attempt = host.startCompatibilityCheck(0)

        host.enterRecovery(attempt.attemptId, 100)
        host.invalidateAttempt()

        expect(host.canApplyAttempt(attempt.attemptId, 100)).toBe(false)
        expect(host.snapshot.phase).toBe('recovery')
    })
})
