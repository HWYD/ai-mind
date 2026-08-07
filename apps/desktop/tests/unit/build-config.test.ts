import { describe, expect, it } from 'vitest'

import {
    createDesktopBuildConfig,
    DESKTOP_APP_USER_MODEL_ID,
    DESKTOP_PRODUCT_ID,
    PRODUCTION_TRUSTED_ORIGIN,
} from '../../src/main/build-config'

describe('desktop build configuration', () => {
    it('uses the fixed production origin and stable product identity for packaged releases', () => {
        expect(
            createDesktopBuildConfig({
                desktopVersion: '0.5.0',
                developmentOrigin: 'http://localhost:3000',
                isPackaged: true,
            })
        ).toEqual({
            appUserModelId: DESKTOP_APP_USER_MODEL_ID,
            channel: 'production',
            compatibilityContractVersion: 1,
            compatibilityPath: '/api/desktop/compatibility',
            desktopVersion: '0.5.0',
            distribution: 'internal-preview',
            productId: DESKTOP_PRODUCT_ID,
            signing: 'unsigned',
            trustedOrigin: PRODUCTION_TRUSTED_ORIGIN,
        })
    })

    it('accepts only explicitly supplied localhost development origins', () => {
        expect(
            createDesktopBuildConfig({
                desktopVersion: '0.5.0',
                developmentOrigin: 'http://127.0.0.1:3000',
                isPackaged: false,
            })
        ).toMatchObject({
            channel: 'development',
            trustedOrigin: 'http://127.0.0.1:3000',
        })

        expect(() => createDesktopBuildConfig({ desktopVersion: '0.5.0', isPackaged: false })).toThrow(
            'A development origin must be explicitly provided.'
        )
        expect(() =>
            createDesktopBuildConfig({
                desktopVersion: '0.5.0',
                developmentOrigin: 'https://preview.example.com',
                isPackaged: false,
            })
        ).toThrow('Development origin must use localhost or 127.0.0.1 over HTTP.')
    })

    it('does not expose an upgrade URL or user-controlled production configuration', () => {
        const config = createDesktopBuildConfig({
            desktopVersion: '0.5.0',
            developmentOrigin: 'http://localhost:3000',
            isPackaged: true,
        })

        expect(config).not.toHaveProperty('upgradeUrl')
        expect(config).not.toHaveProperty('downloadUrl')
        expect(config.trustedOrigin).toBe(PRODUCTION_TRUSTED_ORIGIN)
    })
})
