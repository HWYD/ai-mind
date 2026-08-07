import { describe, expect, it } from 'vitest'

import { MINIMUM_SUPPORTED_DESKTOP_VERSION, resolveDesktopCompatibility } from '@/lib/desktop/compatibility-policy'

describe('desktop compatibility policy', () => {
    it('accepts strict semantic versions at or above the supported release', () => {
        expect(resolveDesktopCompatibility('0.5.0')).toEqual({
            contractVersion: 1,
            status: 'compatible',
        })
        expect(resolveDesktopCompatibility('0.5.1')).toEqual({
            contractVersion: 1,
            status: 'compatible',
        })
        expect(resolveDesktopCompatibility('1.0.0')).toEqual({
            contractVersion: 1,
            status: 'compatible',
        })
    })

    it('requires manual upgrade for older or otherwise unknown desktop releases', () => {
        expect(resolveDesktopCompatibility('0.4.99')).toEqual({
            contractVersion: 1,
            status: 'manual_upgrade_required',
            minimumDesktopVersion: MINIMUM_SUPPORTED_DESKTOP_VERSION,
        })
        expect(resolveDesktopCompatibility('0.0.0')).toEqual({
            contractVersion: 1,
            status: 'manual_upgrade_required',
            minimumDesktopVersion: MINIMUM_SUPPORTED_DESKTOP_VERSION,
        })
        expect(resolveDesktopCompatibility('0.5.0-beta.1')).toEqual({
            contractVersion: 1,
            status: 'manual_upgrade_required',
            minimumDesktopVersion: MINIMUM_SUPPORTED_DESKTOP_VERSION,
        })
    })

    it.each([undefined, '', 'v0.5.0', '0.5', '00.5.0', '0.05.0', '0.5.0.0', '0.5.0-01'])(
        'fails closed for a missing or non-release semver header: %s',
        desktopVersion => {
            expect(resolveDesktopCompatibility(desktopVersion)).toEqual({ kind: 'invalid_desktop_version' })
        }
    )

    it('has no user-identity input or side effect', () => {
        expect(resolveDesktopCompatibility.length).toBe(1)
        expect(resolveDesktopCompatibility('0.5.0')).not.toHaveProperty('session')
        expect(resolveDesktopCompatibility('0.5.0')).not.toHaveProperty('cookie')
    })
})
