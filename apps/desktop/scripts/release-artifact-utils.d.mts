import type { FuseState } from '@electron/fuses'

export type DesktopPreviewManifest = {
    desktopVersion: string
    distribution: 'internal-preview'
    electronVersion: string
    platform: 'win32-x64' | 'darwin-arm64'
    sha256: string
    signing: 'unsigned'
    sourceCommit: string
    trustedOrigin: 'https://ai.hwyblog.cloud'
}

export function createDesktopPreviewManifest(input: {
    artifact: Uint8Array
    desktopVersion: string
    electronVersion: string
    platform: DesktopPreviewManifest['platform']
    sourceCommit: string
}): DesktopPreviewManifest

export function validateDesktopPreviewManifest(value: unknown): DesktopPreviewManifest

export function sha256(value: Uint8Array): string

export function hasRequiredFuseConfiguration(fuseWire: Partial<Record<number, FuseState>>): boolean
