import { describe, expect, it, vi } from 'vitest'

import { evaluateImageDownload, installDownloadPolicy } from '../../src/main/security-policy'

type DownloadPolicyInput = Parameters<typeof evaluateImageDownload>[0]
type DownloadFailureReason = Exclude<ReturnType<typeof evaluateImageDownload>, { allowed: true }>['reason']

const trustedOrigin = 'https://ai.hwyblog.cloud'
const trustedBlobUrl = 'blob:https://ai.hwyblog.cloud/9a7f3a3a-4b2c-4d3b-8b5e-123456789abc'

function createInput(overrides: Partial<Parameters<typeof evaluateImageDownload>[0]> = {}) {
    return {
        filename: 'generated-image.png',
        hasUserGesture: true,
        isMainFrame: true,
        mimeType: 'image/png',
        sourceURL: trustedOrigin + '/chat',
        trustedOrigin,
        urlChain: [trustedBlobUrl],
        ...overrides,
    }
}

describe('desktop image download policy', () => {
    it('allows only a trusted main-frame image Blob with a user gesture', () => {
        expect(evaluateImageDownload(createInput())).toEqual({
            allowed: true,
            extension: 'png',
            filename: 'generated-image.png',
        })
    })

    it.each([
        ['subframe', { isMainFrame: false }, 'MAIN_FRAME_REQUIRED'],
        ['automatic download', { hasUserGesture: false }, 'USER_GESTURE_REQUIRED'],
        ['redirect chain', { urlChain: [trustedBlobUrl, trustedBlobUrl] }, 'SINGLE_BLOB_REQUIRED'],
        ['network URL', { urlChain: [trustedOrigin + '/api/chat/runs/run-1/image'] }, 'SINGLE_BLOB_REQUIRED'],
        ['off-origin source', { sourceURL: 'https://evil.example/chat' }, 'TRUSTED_SOURCE_REQUIRED'],
        ['off-origin Blob', { urlChain: ['blob:https://evil.example/image'] }, 'TRUSTED_BLOB_REQUIRED'],
        ['unsafe scheme', { urlChain: ['file:///tmp/generated-image.png'] }, 'SINGLE_BLOB_REQUIRED'],
        ['path traversal filename', { filename: '../generated-image.png' }, 'SAFE_FILENAME_REQUIRED'],
        ['MIME mismatch', { filename: 'generated-image.png', mimeType: 'image/jpeg' }, 'IMAGE_TYPE_MISMATCH'],
        ['unsupported image type', { filename: 'generated-image.gif', mimeType: 'image/gif' }, 'IMAGE_TYPE_MISMATCH'],
    ] satisfies Array<[string, Partial<DownloadPolicyInput>, DownloadFailureReason]>)('denies %s', (_name, overrides, reason) => {
        expect(evaluateImageDownload(createInput(overrides))).toEqual({ allowed: false, reason })
    })

    it('installs a deny-by-default will-download handler and never chooses a file path', () => {
        const handlers = new Map<string, (...args: unknown[]) => void>()
        const session = {
            on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
        } as unknown as Electron.Session
        const preventDefault = vi.fn()
        const setSaveDialogOptions = vi.fn()
        const item = {
            cancel: vi.fn(),
            getFilename: () => 'generated-image.webp',
            getMimeType: () => 'image/webp',
            getURLChain: () => [trustedBlobUrl.replace(/[^/]+$/u, 'webp-result')],
            hasUserGesture: () => true,
            setSaveDialogOptions,
            setSavePath: vi.fn(),
        }
        const webContents = { getURL: () => trustedOrigin + '/chat' }

        installDownloadPolicy({ session, trustedOrigin })
        const handler = handlers.get('will-download')
        if (!handler) {
            throw new Error('will-download policy handler was not installed.')
        }

        handler({ preventDefault }, item, webContents)
        expect(preventDefault).not.toHaveBeenCalled()
        expect(setSaveDialogOptions).toHaveBeenCalledWith({
            defaultPath: 'generated-image.webp',
            filters: [{ extensions: ['webp'], name: '图像文件' }],
        })
        expect(item.setSavePath).not.toHaveBeenCalled()
        expect(item.cancel).not.toHaveBeenCalled()

        const deniedItem = {
            ...item,
            getURLChain: () => [trustedOrigin + '/api/chat/runs/run-1/image'],
        }
        handler({ preventDefault }, deniedItem, webContents)
        expect(preventDefault).toHaveBeenCalledTimes(1)
    })
})
