import type { NextRequest } from 'next/server'

import { resolveDesktopCompatibility } from '@/lib/desktop/compatibility-policy'

export const runtime = 'nodejs'

const desktopCompatibilityAccept = 'application/vnd.ai-mind.desktop-compatibility+json; version=1'
const responseHeaders = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
}

export function GET(request: NextRequest) {
    if (request.headers.get('accept') !== desktopCompatibilityAccept) {
        return Response.json(
            {
                code: 'DESKTOP_COMPATIBILITY_ACCEPT_INVALID',
                error: 'Desktop compatibility contract is not accepted.',
            },
            { headers: responseHeaders, status: 406 }
        )
    }

    const result = resolveDesktopCompatibility(request.headers.get('x-ai-mind-desktop-version'))

    if ('kind' in result) {
        return Response.json(
            {
                code: 'DESKTOP_COMPATIBILITY_VERSION_INVALID',
                error: 'Desktop version is invalid.',
            },
            { headers: responseHeaders, status: 400 }
        )
    }

    return Response.json(result, { headers: responseHeaders })
}
