import { expect, test } from '@playwright/test'

import { createConfirmedProfileReset } from '../../src/main/session-profile'

test('confirmed reset invalidates the active attempt, clears only the local profile, and always rechecks compatibility', async () => {
    const events: string[] = []
    const clearData = async () => {
        events.push('clear')
    }
    const reset = createConfirmedProfileReset({
        destroyWorkspace: () => {
            events.push('destroy')
        },
        invalidateAttempt: () => {
            events.push('invalidate')
        },
        restartCompatibilityCheck: async () => {
            events.push('recheck')
        },
        session: { clearData },
        trustedOrigin: 'https://ai.hwyblog.cloud',
    })

    await expect(reset.reset()).resolves.toBe('completed')
    expect(events).toEqual(['invalidate', 'destroy', 'clear', 'recheck'])
})

test('failed local clearing remains local, rechecks compatibility, and does not start a concurrent reset', async () => {
    let resolveClear: (() => void) | undefined
    const clear = new Promise<void>(resolve => {
        resolveClear = resolve
    })
    let recheckCalls = 0
    const reset = createConfirmedProfileReset({
        destroyWorkspace: () => undefined,
        invalidateAttempt: () => undefined,
        restartCompatibilityCheck: async () => {
            recheckCalls += 1
        },
        session: { clearData: async () => clear },
        trustedOrigin: 'https://ai.hwyblog.cloud',
    })

    const firstReset = reset.reset()
    await expect(reset.reset()).resolves.toBe('already_in_progress')
    resolveClear?.()

    await expect(firstReset).resolves.toBe('completed')
    expect(recheckCalls).toBe(1)
})
