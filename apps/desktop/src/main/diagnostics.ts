import type { DesktopBuildConfig } from './build-config'

export type DesktopSafeErrorCode =
    | 'COMPATIBILITY_CONTRACT_INVALID'
    | 'COMPATIBILITY_HTTP_FAILED'
    | 'COMPATIBILITY_TIMEOUT'
    | 'LOCAL_RECOVERY_UNAVAILABLE'
    | 'NETWORK_UNAVAILABLE'
    | 'PROFILE_UNAVAILABLE'
    | 'TLS_VALIDATION_FAILED'
    | 'WORKSPACE_LOAD_FAILED'
    | 'WORKSPACE_LOAD_TIMEOUT'

type DiagnosticCompatibility =
    | { kind: 'compatible' }
    | { kind: 'manual_upgrade_required'; minimumDesktopVersion: string }
    | { errorCode: DesktopSafeErrorCode; kind: 'unavailable' }
    | { kind: 'not_checked' }

export type DesktopSupportDiagnostic = {
    architecture: 'arm64' | 'x64'
    chromiumVersion: string
    compatibilityState: DiagnosticCompatibility['kind']
    desktopRelease: string
    electronVersion: string
    generatedAt: string
    minimumDesktopVersion?: string
    platform: 'darwin' | 'win32'
    safeNetworkErrorCode?: DesktopSafeErrorCode
    schemaVersion: 1
    trustedOrigin: string
}

export function createDesktopSupportDiagnostic(input: {
    architecture: DesktopSupportDiagnostic['architecture']
    chromiumVersion: string
    compatibility: DiagnosticCompatibility
    desktopRelease: string
    electronVersion: string
    generatedAt: string
    platform: DesktopSupportDiagnostic['platform']
    trustedOrigin: DesktopBuildConfig['trustedOrigin']
}): DesktopSupportDiagnostic {
    const diagnostic: DesktopSupportDiagnostic = {
        architecture: input.architecture,
        chromiumVersion: input.chromiumVersion,
        compatibilityState: input.compatibility.kind,
        desktopRelease: input.desktopRelease,
        electronVersion: input.electronVersion,
        generatedAt: input.generatedAt,
        platform: input.platform,
        schemaVersion: 1,
        trustedOrigin: input.trustedOrigin,
    }

    if (input.compatibility.kind === 'manual_upgrade_required') {
        diagnostic.minimumDesktopVersion = input.compatibility.minimumDesktopVersion
    }

    if (input.compatibility.kind === 'unavailable') {
        diagnostic.safeNetworkErrorCode = input.compatibility.errorCode
    }

    return diagnostic
}

export function formatDesktopSupportDiagnostic(diagnostic: DesktopSupportDiagnostic): string {
    return JSON.stringify(diagnostic, null, 2)
}

export async function copyDesktopSupportDiagnostic(input: {
    diagnostic: DesktopSupportDiagnostic
    writeText: (text: string) => void | Promise<void>
}): Promise<'copied' | 'failed'> {
    try {
        await input.writeText(formatDesktopSupportDiagnostic(input.diagnostic))
        return 'copied'
    } catch {
        return 'failed'
    }
}

export async function exportDesktopSupportDiagnostic(input: {
    diagnostic: DesktopSupportDiagnostic
    showSaveDialog: (options: {
        defaultPath: string
        filters: Array<{ extensions: string[]; name: string }>
        title: string
    }) => Promise<{ canceled: boolean; filePath?: string }>
    writeFile: (filePath: string, data: string, encoding: 'utf8') => void | Promise<void>
}): Promise<'cancelled' | 'failed' | 'saved'> {
    try {
        const result = await input.showSaveDialog({
            defaultPath: `ai-mind-desktop-diagnostic-${input.diagnostic.desktopRelease}.txt`,
            filters: [{ extensions: ['txt'], name: '文本文件' }],
            title: '导出 AI Mind Desktop 诊断信息',
        })

        if (result.canceled || !result.filePath) {
            return 'cancelled'
        }

        await input.writeFile(result.filePath, formatDesktopSupportDiagnostic(input.diagnostic), 'utf8')
        return 'saved'
    } catch {
        return 'failed'
    }
}
