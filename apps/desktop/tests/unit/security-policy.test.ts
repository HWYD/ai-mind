import { describe, expect, it, vi } from 'vitest'

import {
    installWorkspaceSecurityPolicy,
    isSafeExternalUrl,
    isTrustedWorkspaceUrl,
    shouldAllowExternalOpen,
    shouldAllowWorkspacePermission,
    shouldOverrideCertificateError,
} from '../../src/main/security-policy'

const trustedOrigin = 'https://ai.hwyblog.cloud'

describe('workspace navigation policy', () => {
    it.each(['https://ai.hwyblog.cloud/', 'https://ai.hwyblog.cloud/instant-mind?view=chat', 'https://ai.hwyblog.cloud:443/chat'])(
        'allows only trusted-origin workspace navigation: %s',
        url => {
            expect(isTrustedWorkspaceUrl(url, trustedOrigin)).toBe(true)
        }
    )

    it.each([
        'https://evil.example/',
        'http://ai.hwyblog.cloud/',
        'https://user@ai.hwyblog.cloud/',
        'https://ai.hwyblog.cloud.evil.example/',
        'file:///C:/windows/system32',
        'data:text/html,blocked',
        'not a URL',
    ])('rejects untrusted workspace navigation: %s', url => {
        expect(isTrustedWorkspaceUrl(url, trustedOrigin)).toBe(false)
    })
})

describe('external-opening policy', () => {
    it.each(['https://docs.example.com/', 'https://docs.example.com:443/guide'])('recognizes a syntactically safe HTTPS URL: %s', url => {
        expect(isSafeExternalUrl(url)).toBe(true)
    })

    it.each([
        'http://docs.example.com/',
        'https://user:password@docs.example.com/',
        'file:///C:/windows/system32',
        'data:text/html,blocked',
        'javascript:alert(1)',
        'ai-mind-desktop://local/',
        'not a URL',
    ])('rejects unsafe external URL input: %s', url => {
        expect(isSafeExternalUrl(url)).toBe(false)
    })

    it.each([
        { disposition: 'foreground-tab', postBodyItems: 0, url: 'https://docs.example.com/' },
        { disposition: 'foreground-tab', postBodyItems: 1, url: 'https://docs.example.com/form' },
        { disposition: 'new-window', postBodyItems: 0, url: 'https://docs.example.com/' },
    ])('keeps every Electron window-open vector denied after the behavior gate', input => {
        expect(shouldAllowExternalOpen(input)).toBe(false)
    })
})

describe('workspace permission policy', () => {
    it('allows only sanitized clipboard writes from the trusted workspace main frame', () => {
        expect(
            shouldAllowWorkspacePermission({
                isMainFrame: true,
                permission: 'clipboard-sanitized-write',
                requestingOrigin: trustedOrigin,
                trustedOrigin,
            })
        ).toBe(true)
    })

    it.each([
        { isMainFrame: false, permission: 'clipboard-sanitized-write', requestingOrigin: trustedOrigin },
        { isMainFrame: true, permission: 'clipboard-read', requestingOrigin: trustedOrigin },
        { isMainFrame: true, permission: 'fileSystem', requestingOrigin: trustedOrigin },
        { isMainFrame: true, permission: 'media', requestingOrigin: 'https://evil.example' },
        { isMainFrame: true, permission: 'unknown', requestingOrigin: trustedOrigin },
    ])('denies every other permission request: %o', input => {
        expect(shouldAllowWorkspacePermission({ ...input, trustedOrigin })).toBe(false)
    })
})

describe('Electron security policy installation', () => {
    it('installs navigation, popup, and both permission deny-by-default handlers', () => {
        const navigationHandlers = new Map<string, (...arguments_: unknown[]) => void>()
        const setPermissionCheckHandler = vi.fn()
        const setPermissionRequestHandler = vi.fn()
        const setWindowOpenHandler = vi.fn()
        const sessionOn = vi.fn()
        const webContents = {
            on: vi.fn((event: string, handler: (...arguments_: unknown[]) => void) => {
                navigationHandlers.set(event, handler)
            }),
            setWindowOpenHandler,
        }

        installWorkspaceSecurityPolicy({
            session: { on: sessionOn, setPermissionCheckHandler, setPermissionRequestHandler } as unknown as Electron.Session,
            trustedOrigin,
            webContents: webContents as unknown as Electron.WebContents,
        })

        const blockedNavigation = { preventDefault: vi.fn(), url: 'https://evil.example/' }
        navigationHandlers.get('will-navigate')?.(blockedNavigation, blockedNavigation.url)
        navigationHandlers.get('will-frame-navigate')?.(blockedNavigation)
        navigationHandlers.get('will-redirect')?.(blockedNavigation, blockedNavigation.url)

        expect(blockedNavigation.preventDefault).toHaveBeenCalledTimes(3)

        const trustedNavigation = { preventDefault: vi.fn(), url: `${trustedOrigin}/instant-mind` }
        navigationHandlers.get('will-navigate')?.(trustedNavigation, trustedNavigation.url)
        navigationHandlers.get('will-frame-navigate')?.(trustedNavigation)
        navigationHandlers.get('will-redirect')?.(trustedNavigation, trustedNavigation.url)

        expect(trustedNavigation.preventDefault).not.toHaveBeenCalled()
        const windowOpenHandler = setWindowOpenHandler.mock.calls[0]?.[0]
        expect(windowOpenHandler).toBeDefined()
        expect(windowOpenHandler?.({})).toEqual({ action: 'deny' })

        const permissionCheckHandler = setPermissionCheckHandler.mock.calls[0]?.[0] as (
            contents: Electron.WebContents | null,
            permission: string,
            requestingOrigin: string,
            details: { isMainFrame: boolean }
        ) => boolean
        expect(permissionCheckHandler).toBeDefined()
        expect(permissionCheckHandler(null, 'clipboard-sanitized-write', trustedOrigin, { isMainFrame: true })).toBe(true)
        expect(permissionCheckHandler(null, 'clipboard-read', trustedOrigin, { isMainFrame: true })).toBe(false)

        const permissionRequestHandler = setPermissionRequestHandler.mock.calls[0]?.[0] as (
            contents: Electron.WebContents,
            permission: string,
            callback: (granted: boolean) => void,
            details: { isMainFrame: boolean; requestingUrl: string }
        ) => void
        expect(permissionRequestHandler).toBeDefined()
        const callback = vi.fn()
        permissionRequestHandler({} as Electron.WebContents, 'clipboard-sanitized-write', callback, {
            isMainFrame: false,
            requestingUrl: trustedOrigin,
        })

        expect(callback).toHaveBeenCalledWith(false)
        expect(sessionOn).toHaveBeenCalledWith('will-download', expect.any(Function))
    })

    it('never overrides Electron default certificate rejection', () => {
        expect(shouldOverrideCertificateError()).toBe(false)
    })
})
