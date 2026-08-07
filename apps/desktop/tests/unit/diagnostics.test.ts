import { describe, expect, it, vi } from 'vitest'

import {
    copyDesktopSupportDiagnostic,
    createDesktopSupportDiagnostic,
    exportDesktopSupportDiagnostic,
    formatDesktopSupportDiagnostic,
} from '../../src/main/diagnostics'

function createDiagnostic() {
    const unsafeInput = {
        architecture: 'x64' as const,
        chat: 'private chat content',
        chromiumVersion: '140.0.0.0',
        compatibility: {
            kind: 'manual_upgrade_required' as const,
            minimumDesktopVersion: '0.5.1',
        },
        cookie: 'session=secret',
        desktopRelease: '0.5.0',
        electronVersion: '43.2.0',
        generatedAt: '2026-08-05T00:00:00.000Z',
        platform: 'win32' as const,
        rawError: 'net::ERR_CERT_AUTHORITY_INVALID',
        secret: 'api-key',
        trustedOrigin: 'https://ai.hwyblog.cloud',
    }

    return createDesktopSupportDiagnostic(unsafeInput)
}

describe('desktop support diagnostic', () => {
    it('projects only the v1 allowlist and includes the upgrade minimum only when required', () => {
        const diagnostic = createDiagnostic()

        expect(diagnostic).toEqual({
            architecture: 'x64',
            chromiumVersion: '140.0.0.0',
            compatibilityState: 'manual_upgrade_required',
            desktopRelease: '0.5.0',
            electronVersion: '43.2.0',
            generatedAt: '2026-08-05T00:00:00.000Z',
            minimumDesktopVersion: '0.5.1',
            platform: 'win32',
            schemaVersion: 1,
            trustedOrigin: 'https://ai.hwyblog.cloud',
        })

        const text = formatDesktopSupportDiagnostic(diagnostic)
        expect(text).not.toContain('private chat content')
        expect(text).not.toContain('session=secret')
        expect(text).not.toContain('api-key')
        expect(text).not.toContain('ERR_CERT')
    })

    it('copies and exports only the formatted local diagnostic without returning a filesystem path', async () => {
        const diagnostic = createDiagnostic()
        const writeText = vi.fn()
        const showSaveDialog = vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:/private/diagnostic.txt' })
        const writeFile = vi.fn().mockResolvedValue(undefined)

        await expect(copyDesktopSupportDiagnostic({ diagnostic, writeText })).resolves.toBe('copied')
        await expect(exportDesktopSupportDiagnostic({ diagnostic, showSaveDialog, writeFile })).resolves.toBe('saved')

        expect(writeText).toHaveBeenCalledWith(formatDesktopSupportDiagnostic(diagnostic))
        expect(showSaveDialog).toHaveBeenCalledWith({
            defaultPath: 'ai-mind-desktop-diagnostic-0.5.0.txt',
            filters: [{ extensions: ['txt'], name: '文本文件' }],
            title: '导出 AI Mind Desktop 诊断信息',
        })
        expect(writeFile).toHaveBeenCalledWith('C:/private/diagnostic.txt', formatDesktopSupportDiagnostic(diagnostic), 'utf8')
    })

    it('records the supported macOS arm64 runtime without widening the diagnostic allowlist', () => {
        const diagnostic = createDesktopSupportDiagnostic({
            architecture: 'arm64',
            chromiumVersion: '140.0.0.0',
            compatibility: { kind: 'compatible' },
            desktopRelease: '0.5.0',
            electronVersion: '43.2.0',
            generatedAt: '2026-08-05T00:00:00.000Z',
            platform: 'darwin',
            trustedOrigin: 'https://ai.hwyblog.cloud',
        })

        expect(diagnostic).toMatchObject({ architecture: 'arm64', platform: 'darwin', compatibilityState: 'compatible' })
        expect(diagnostic).not.toHaveProperty('minimumDesktopVersion')
    })

    it('does not write a file when the native export dialog is cancelled', async () => {
        const showSaveDialog = vi.fn().mockResolvedValue({ canceled: true })
        const writeFile = vi.fn()

        await expect(exportDesktopSupportDiagnostic({ diagnostic: createDiagnostic(), showSaveDialog, writeFile })).resolves.toBe(
            'cancelled'
        )
        expect(writeFile).not.toHaveBeenCalled()
    })
})
