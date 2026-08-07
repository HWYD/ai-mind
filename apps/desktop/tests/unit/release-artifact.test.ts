import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createPackageWithOptions } from '@electron/asar'
import { FuseState, FuseV1Options } from '@electron/fuses'
import { describe, expect, it } from 'vitest'

import { hasForbiddenArtifactName, inspectPackagedContents } from '../../scripts/release-artifact-audit.mjs'
import {
    createDesktopPreviewManifest,
    hasRequiredFuseConfiguration,
    validateDesktopPreviewManifest,
} from '../../scripts/release-artifact-utils.mjs'

const sourceCommit = 'a'.repeat(40)

describe('desktop release artifact', () => {
    it('creates a complete internal-preview manifest with an artifact SHA-256', () => {
        const manifest = createDesktopPreviewManifest({
            artifact: Buffer.from('desktop-installer'),
            desktopVersion: '0.5.0',
            electronVersion: '43.2.0',
            platform: 'win32-x64',
            sourceCommit,
        })

        expect(manifest).toEqual({
            desktopVersion: '0.5.0',
            distribution: 'internal-preview',
            electronVersion: '43.2.0',
            platform: 'win32-x64',
            sha256: 'e73aa42ada9cffb57724a719a5da12ad388205ee4baab321a1a07c83290f29d2',
            signing: 'unsigned',
            sourceCommit,
            trustedOrigin: 'https://ai.hwyblog.cloud',
        })
    })

    it('rejects malformed manifests and forbidden release configuration', () => {
        const manifest = createDesktopPreviewManifest({
            artifact: Buffer.from('desktop-installer'),
            desktopVersion: '0.5.0',
            electronVersion: '43.2.0',
            platform: 'win32-x64',
            sourceCommit,
        })

        expect(validateDesktopPreviewManifest(manifest)).toEqual(manifest)
        expect(() => validateDesktopPreviewManifest({ ...manifest, downloadUrl: 'https://example.com' })).toThrow('unknown field')
        expect(() => validateDesktopPreviewManifest({ ...manifest, trustedOrigin: 'http://localhost:3000' })).toThrow('trustedOrigin')
        expect(() => validateDesktopPreviewManifest({ ...manifest, signing: 'signed' })).toThrow('signing')
        expect(() => validateDesktopPreviewManifest({ ...manifest, platform: 'darwin-x64' })).toThrow('platform')
    })

    it('supports the macOS arm64 manifest without permitting Intel or universal targets', () => {
        const manifest = createDesktopPreviewManifest({
            artifact: Buffer.from('desktop-dmg'),
            desktopVersion: '0.5.0',
            electronVersion: '43.2.0',
            platform: 'darwin-arm64',
            sourceCommit,
        })

        expect(manifest.platform).toBe('darwin-arm64')
        expect(() => validateDesktopPreviewManifest({ ...manifest, platform: 'darwin-x64' })).toThrow('platform')
        expect(() => validateDesktopPreviewManifest({ ...manifest, platform: 'darwin-arm64-universal' })).toThrow('platform')
    })

    it('requires the actual packaged fuse wire to match the release baseline', () => {
        const secureWire = {
            [FuseV1Options.EnableCookieEncryption]: FuseState.ENABLE,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: FuseState.ENABLE,
            [FuseV1Options.EnableNodeCliInspectArguments]: FuseState.DISABLE,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: FuseState.DISABLE,
            [FuseV1Options.GrantFileProtocolExtraPrivileges]: FuseState.DISABLE,
            [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: FuseState.DISABLE,
            [FuseV1Options.OnlyLoadAppFromAsar]: FuseState.ENABLE,
            [FuseV1Options.RunAsNode]: FuseState.DISABLE,
        }

        expect(hasRequiredFuseConfiguration(secureWire)).toBe(true)
        expect(
            hasRequiredFuseConfiguration({
                ...secureWire,
                [FuseV1Options.RunAsNode]: FuseState.ENABLE,
            })
        ).toBe(false)
        expect(
            hasRequiredFuseConfiguration({
                ...secureWire,
                [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: FuseState.ENABLE,
            })
        ).toBe(false)
    })

    it('rejects forbidden names inside the actual app.asar entry list', async () => {
        const packageDirectory = await mkdtemp(path.join(tmpdir(), 'ai-mind-release-artifact-'))
        const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'ai-mind-release-artifact-source-'))
        const archivePath = path.join(packageDirectory, 'app.asar')

        try {
            await writeFile(path.join(sourceDirectory, '.env.production'), 'SECRET=value\n', 'utf8')
            await createPackageWithOptions(sourceDirectory, archivePath, { dot: true })

            await expect(inspectPackagedContents(packageDirectory)).rejects.toThrow('forbidden filename')
        } finally {
            await Promise.all([
                rm(packageDirectory, { force: true, recursive: true }),
                rm(sourceDirectory, { force: true, recursive: true }),
            ])
        }
    })

    it('inspects every entry in a clean app.asar archive', async () => {
        const packageDirectory = await mkdtemp(path.join(tmpdir(), 'ai-mind-release-artifact-'))
        const sourceDirectory = await mkdtemp(path.join(tmpdir(), 'ai-mind-release-artifact-source-'))
        const archivePath = path.join(packageDirectory, 'app.asar')

        try {
            await writeFile(path.join(sourceDirectory, 'main.js'), "console.log('desktop')\n", 'utf8')
            await mkdir(path.join(sourceDirectory, 'nested'))
            await writeFile(path.join(sourceDirectory, 'nested', 'main.js'), "console.log('nested desktop')\n", 'utf8')
            await createPackageWithOptions(sourceDirectory, archivePath, { dot: true })

            await expect(inspectPackagedContents(packageDirectory)).resolves.toBeUndefined()
        } finally {
            await Promise.all([
                rm(packageDirectory, { force: true, recursive: true }),
                rm(sourceDirectory, { force: true, recursive: true }),
            ])
        }
    })

    it('keeps forbidden file-name matching consistent for packaged and ASAR paths', () => {
        expect(hasForbiddenArtifactName('resources/app.asar/.env')).toBe(true)
        expect(hasForbiddenArtifactName('resources/app.asar/certificate.pem')).toBe(true)
        expect(hasForbiddenArtifactName('resources/app.asar/main.js')).toBe(false)
    })
})
