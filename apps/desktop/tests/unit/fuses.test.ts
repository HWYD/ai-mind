import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { describe, expect, it } from 'vitest'

import { desktopFuseConfig } from '../../src/main/build-config'

describe('desktop package fuses', () => {
    it('enables at-rest and ASAR protections while disabling Node execution vectors', () => {
        expect(desktopFuseConfig).toMatchObject({
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
            [FuseV1Options.RunAsNode]: false,
            strictlyRequireAllFuses: true,
            version: FuseVersion.V1,
        })
    })

    it('does not grant file protocol extra privileges', () => {
        expect(desktopFuseConfig[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(false)
    })
})
