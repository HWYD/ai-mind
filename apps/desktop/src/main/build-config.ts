import { type FuseConfig, FuseV1Options, FuseVersion } from '@electron/fuses'

export const DESKTOP_PRODUCT_ID = 'cloud.hwyblog.ai-mind.desktop'
export const DESKTOP_APP_USER_MODEL_ID = 'cloud.hwyblog.ai-mind.desktop'
export const DESKTOP_EXECUTABLE_NAME = 'AI Mind Desktop'
export const PRODUCTION_TRUSTED_ORIGIN = 'https://ai.hwyblog.cloud'

export type DesktopBuildConfig = {
    appUserModelId: typeof DESKTOP_APP_USER_MODEL_ID
    channel: 'development' | 'production'
    compatibilityContractVersion: 1
    compatibilityPath: '/api/desktop/compatibility'
    desktopVersion: string
    distribution: 'internal-preview'
    productId: typeof DESKTOP_PRODUCT_ID
    signing: 'unsigned'
    trustedOrigin: string
}

const strictSemverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+)(?:\.(?:0|[1-9]\d*|(?=[0-9A-Za-z-]*[A-Za-z-])[0-9A-Za-z-]+))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u

export const desktopFuseConfig: FuseConfig = {
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    // Electron 43 的发布包没有 browser_v8_context_snapshot.bin；启用会使打包程序在应用启动前退出。
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.WasmTrapHandlers]: true,
    strictlyRequireAllFuses: true,
    version: FuseVersion.V1,
}

export function createDesktopBuildConfig(input: {
    desktopVersion: string
    developmentOrigin?: string
    isPackaged: boolean
}): DesktopBuildConfig {
    if (!strictSemverPattern.test(input.desktopVersion)) {
        throw new Error('Desktop version must be strict semver.')
    }

    if (input.isPackaged) {
        return createConfig(input.desktopVersion, 'production', PRODUCTION_TRUSTED_ORIGIN)
    }

    if (!input.developmentOrigin) {
        throw new Error('A development origin must be explicitly provided.')
    }

    return createConfig(input.desktopVersion, 'development', parseDevelopmentOrigin(input.developmentOrigin))
}

function createConfig(desktopVersion: string, channel: DesktopBuildConfig['channel'], trustedOrigin: string): DesktopBuildConfig {
    return {
        appUserModelId: DESKTOP_APP_USER_MODEL_ID,
        channel,
        compatibilityContractVersion: 1,
        compatibilityPath: '/api/desktop/compatibility',
        desktopVersion,
        distribution: 'internal-preview',
        productId: DESKTOP_PRODUCT_ID,
        signing: 'unsigned',
        trustedOrigin,
    }
}

function parseDevelopmentOrigin(value: string): string {
    let origin: URL

    try {
        origin = new URL(value)
    } catch {
        throw new Error('Development origin must use localhost or 127.0.0.1 over HTTP.')
    }

    if (
        origin.protocol !== 'http:' ||
        (origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') ||
        origin.username ||
        origin.password ||
        origin.pathname !== '/' ||
        origin.search ||
        origin.hash
    ) {
        throw new Error('Development origin must use localhost or 127.0.0.1 over HTTP.')
    }

    return origin.origin
}
