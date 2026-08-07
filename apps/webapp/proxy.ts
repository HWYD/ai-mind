import { type NextRequest, NextResponse } from 'next/server'

import { createDocumentSecurityHeaders } from '@/lib/security/browser-security-headers'

export function proxy(request: NextRequest) {
    if (!isDocumentRequest(request)) {
        return NextResponse.next()
    }

    const nonce = crypto.randomUUID().replaceAll('-', '')
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    })

    for (const [name, value] of Object.entries(createDocumentSecurityHeaders(nonce))) {
        response.headers.set(name, value)
    }

    return response
}

function isDocumentRequest(request: NextRequest): boolean {
    const { pathname } = request.nextUrl

    if (
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next/static/') ||
        pathname.startsWith('/_next/image') ||
        pathname === '/favicon.ico' ||
        request.headers.has('next-router-prefetch') ||
        request.headers.get('purpose') === 'prefetch'
    ) {
        return false
    }

    return request.headers.get('sec-fetch-dest') === 'document' || request.headers.get('accept')?.includes('text/html') === true
}

export const config = {
    matcher: [
        {
            missing: [
                { key: 'next-router-prefetch', type: 'header' },
                { key: 'purpose', type: 'header', value: 'prefetch' },
            ],
            source: '/((?!api(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$).*)',
        },
    ],
}
