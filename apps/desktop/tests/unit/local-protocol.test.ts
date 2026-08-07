import { describe, expect, it, vi } from 'vitest'

import { createRecoveryProtocolHandler, installRecoveryProtocolHandler, LocalProtocolRegistrar } from '../../src/main/local-protocol'

describe('local recovery protocol', () => {
    it('registers exactly one minimal privileged scheme before app readiness', () => {
        const registerSchemesAsPrivileged = vi.fn()
        const registrar = new LocalProtocolRegistrar()

        registrar.registerBeforeReady({ registerSchemesAsPrivileged })

        expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
            {
                privileges: { secure: true, standard: true },
                scheme: 'ai-mind-desktop',
            },
        ])
        expect(() => registrar.registerBeforeReady({ registerSchemesAsPrivileged })).toThrow('already registered')
    })

    it('serves only the ASAR recovery allowlist with a local-only script CSP and inline-style compatibility', async () => {
        const readFile = vi.fn().mockResolvedValue(Buffer.from('<!doctype html>'))
        const handler = createRecoveryProtocolHandler({
            assetRoot: 'C:/AI Mind/resources/app.asar/.webpack/renderer',
            readFile,
        })

        const response = await handler({ url: 'ai-mind-desktop://local/' })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'none'")
        expect(response.headers.get('Content-Security-Policy')).toContain("object-src 'none'")
        expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
        expect(response.headers.get('Content-Security-Policy')).toContain("style-src 'self' 'unsafe-inline'")
        expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval')
        expect(readFile).toHaveBeenCalledWith('C:/AI Mind/resources/app.asar/.webpack/renderer/recovery/index.html')
    })

    it('serves the separate local desktop chrome allowlist under the same inline-style policy', async () => {
        const readFile = vi.fn().mockResolvedValue(Buffer.from('<!doctype html>'))
        const handler = createRecoveryProtocolHandler({
            assetRoot: 'C:/AI Mind/resources/app.asar/.webpack/renderer',
            readFile,
        })

        const response = await handler({ url: 'ai-mind-desktop://local/chrome/index.html' })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'none'")
        expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'")
        expect(response.headers.get('Content-Security-Policy')).toContain("style-src 'self' 'unsafe-inline'")
        expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval')
        expect(readFile).toHaveBeenCalledWith('C:/AI Mind/resources/app.asar/.webpack/renderer/chrome/index.html')
    })

    it.each([
        ['ai-mind-desktop://local/chrome/index.js', 'chrome/index.js', 'text/javascript; charset=utf-8'],
        ['ai-mind-desktop://local/chrome/styles.css', 'chrome/styles.css', 'text/css; charset=utf-8'],
        ['ai-mind-desktop://local/recovery/index.js', 'recovery/index.js', 'text/javascript; charset=utf-8'],
        ['ai-mind-desktop://local/recovery/styles.css', 'recovery/styles.css', 'text/css; charset=utf-8'],
    ])('serves only a real Forge local asset: %s', async (url, fileName, contentType) => {
        const readFile = vi.fn().mockResolvedValue(Buffer.from('asset'))
        const handler = createRecoveryProtocolHandler({
            assetRoot: 'C:/AI Mind/resources/app.asar/.webpack/renderer',
            readFile,
        })

        const response = await handler({ url })

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toBe(contentType)
        expect(readFile).toHaveBeenCalledWith(`C:/AI Mind/resources/app.asar/.webpack/renderer/${fileName}`)
    })

    it.each([
        'ai-mind-desktop://local/?query=blocked',
        'ai-mind-desktop://local/#fragment',
        'ai-mind-desktop://local/%2e%2e/index.html',
        'ai-mind-desktop://local/chrome/unknown.js',
        'ai-mind-desktop://local/chrome/chrome_renderer.js',
        'ai-mind-desktop://local/recovery_renderer.js',
        'ai-mind-desktop://local/chrome/index.js?cache=blocked',
        'ai-mind-desktop://local/chrome/styles.css#fragment',
        'ai-mind-desktop://other/index.html',
        'ai-mind-desktop://local/unknown.js',
    ])('rejects untrusted local protocol input: %s', async url => {
        const handler = createRecoveryProtocolHandler({
            assetRoot: 'C:/recovery',
            readFile: vi.fn(),
        })

        expect((await handler({ url })).status).toBe(404)
    })

    it('binds the handler only to the supplied recovery session protocol', () => {
        const handle = vi.fn()

        installRecoveryProtocolHandler({
            assetRoot: 'C:/recovery',
            protocol: { handle },
        })

        expect(handle).toHaveBeenCalledWith('ai-mind-desktop', expect.any(Function))
    })
})
