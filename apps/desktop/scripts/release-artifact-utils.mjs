import { createHash } from 'node:crypto'

import { FuseState, FuseV1Options } from '@electron/fuses'

const productionTrustedOrigin = 'https://ai.hwyblog.cloud'
const strictSemverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+)(?:\.(?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const manifestFields = [
    'desktopVersion',
    'distribution',
    'electronVersion',
    'platform',
    'sha256',
    'signing',
    'sourceCommit',
    'trustedOrigin',
]
const supportedPlatforms = new Set(['win32-x64', 'darwin-arm64'])

export function createDesktopPreviewManifest(input) {
    return validateDesktopPreviewManifest({
        desktopVersion: input.desktopVersion,
        distribution: 'public-beta',
        electronVersion: input.electronVersion,
        platform: input.platform,
        sha256: sha256(input.artifact),
        signing: 'unsigned',
        sourceCommit: input.sourceCommit,
        trustedOrigin: productionTrustedOrigin,
    })
}

export function validateDesktopPreviewManifest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('desktop-release.json must be an object')
    }

    for (const key of Object.keys(value)) {
        if (!manifestFields.includes(key)) {
            throw new Error(`desktop-release.json contains unknown field: ${key}`)
        }
    }

    for (const key of manifestFields) {
        if (!(key in value)) {
            throw new Error(`desktop-release.json is missing ${key}`)
        }
    }

    if (typeof value.desktopVersion !== 'string' || !strictSemverPattern.test(value.desktopVersion)) {
        throw new Error('desktop-release.json desktopVersion must be strict semver')
    }
    if (value.distribution !== 'public-beta') {
        throw new Error('desktop-release.json distribution must be public-beta')
    }
    if (typeof value.electronVersion !== 'string' || !strictSemverPattern.test(value.electronVersion)) {
        throw new Error('desktop-release.json electronVersion must be strict semver')
    }
    if (!supportedPlatforms.has(value.platform)) {
        throw new Error('desktop-release.json platform must be win32-x64 or darwin-arm64')
    }
    if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sha256)) {
        throw new Error('desktop-release.json sha256 must be lowercase SHA-256')
    }
    if (value.signing !== 'unsigned') {
        throw new Error('desktop-release.json signing must be unsigned')
    }
    if (typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40,64}$/u.test(value.sourceCommit)) {
        throw new Error('desktop-release.json sourceCommit must be a full git commit')
    }
    if (value.trustedOrigin !== productionTrustedOrigin) {
        throw new Error('desktop-release.json trustedOrigin must be the fixed production origin')
    }

    return value
}

export function sha256(value) {
    return createHash('sha256').update(value).digest('hex')
}

export function hasRequiredFuseConfiguration(fuseWire) {
    return (
        fuseWire[FuseV1Options.RunAsNode] === FuseState.DISABLE &&
        fuseWire[FuseV1Options.EnableCookieEncryption] === FuseState.ENABLE &&
        fuseWire[FuseV1Options.EnableNodeOptionsEnvironmentVariable] === FuseState.DISABLE &&
        fuseWire[FuseV1Options.EnableNodeCliInspectArguments] === FuseState.DISABLE &&
        fuseWire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation] === FuseState.ENABLE &&
        fuseWire[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot] === FuseState.DISABLE &&
        fuseWire[FuseV1Options.OnlyLoadAppFromAsar] === FuseState.ENABLE &&
        fuseWire[FuseV1Options.GrantFileProtocolExtraPrivileges] === FuseState.DISABLE
    )
}
