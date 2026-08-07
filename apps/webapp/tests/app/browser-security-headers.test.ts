import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { proxy } from '@/proxy'

function createDocumentRequest(pathname: string) {
    return new NextRequest(`https://ai.hwyblog.cloud${pathname}`, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Sec-Fetch-Dest': 'document',
        },
    })
}

describe('browser security headers', () => {
    it.each(['/', '/instant-mind'])('adds a per-document nonce CSP and browser hardening headers: %s', pathname => {
        const response = proxy(createDocumentRequest(pathname))
        const csp = response.headers.get('Content-Security-Policy')

        expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9]+' 'strict-dynamic'/u)
        expect(csp).toContain("style-src 'self' 'unsafe-inline'")
        expect(csp).not.toMatch(/style-src[^;]*nonce-/u)
        expect(csp).not.toContain('style-src-attr')
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("frame-ancestors 'none'")
        expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/u)
        expect(csp).not.toContain('unsafe-eval')
        expect(response.headers.get('Permissions-Policy')).toContain('camera=()')
        expect(response.headers.get('Permissions-Policy')).toContain('clipboard-read=()')
        expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('creates a new nonce for each document response', () => {
        const first = proxy(createDocumentRequest('/')).headers.get('Content-Security-Policy')
        const second = proxy(createDocumentRequest('/')).headers.get('Content-Security-Policy')

        expect(first).not.toBe(second)
    })

    it.each([
        ['/api/desktop/compatibility', { Accept: 'application/json' }],
        ['/_next/static/chunks/app.js', {}],
        ['/_next/image?url=%2Flogo.png&w=256&q=75', {}],
        ['/instant-mind', { Accept: 'text/html', 'next-router-prefetch': '1' }],
    ])('does not attach document CSP to non-document or prefetch traffic: %s', (pathname, headers) => {
        const response = proxy(
            new NextRequest(`https://ai.hwyblog.cloud${pathname}`, {
                headers,
            })
        )

        expect(response.headers.get('Content-Security-Policy')).toBeNull()
        expect(response.headers.get('Permissions-Policy')).toBeNull()
        expect(response.headers.get('X-Frame-Options')).toBeNull()
    })
})
