import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api/desktop/compatibility/route'

const desktopCompatibilityAccept = 'application/vnd.ai-mind.desktop-compatibility+json; version=1'

function createRequest(headers: HeadersInit = {}) {
    return new NextRequest('https://ai.hwyblog.cloud/api/desktop/compatibility', {
        headers,
        method: 'GET',
    })
}

describe('GET /api/desktop/compatibility', () => {
    it('returns the strict v1 compatible DTO without cookie side effects', async () => {
        const response = await GET(
            createRequest({
                Accept: desktopCompatibilityAccept,
                Cookie: 'ai-mind-session-id=existing-session',
                'X-AI-Mind-Desktop-Version': '0.5.0',
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Content-Type')).toContain('application/json')
        expect(response.headers.get('Set-Cookie')).toBeNull()
        await expect(response.json()).resolves.toEqual({
            contractVersion: 1,
            status: 'compatible',
        })
    })

    it('returns the strict manual-upgrade DTO for an unsupported release', async () => {
        const response = await GET(
            createRequest({
                Accept: desktopCompatibilityAccept,
                'X-AI-Mind-Desktop-Version': '0.4.99',
            })
        )

        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        await expect(response.json()).resolves.toEqual({
            contractVersion: 1,
            minimumDesktopVersion: '0.5.0',
            status: 'manual_upgrade_required',
        })
    })

    it('rejects requests that do not opt into the v1 media contract', async () => {
        const response = await GET(
            createRequest({
                Accept: 'application/json',
                'X-AI-Mind-Desktop-Version': '0.5.0',
            })
        )

        expect(response.status).toBe(406)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Set-Cookie')).toBeNull()
        await expect(response.json()).resolves.toEqual({
            code: 'DESKTOP_COMPATIBILITY_ACCEPT_INVALID',
            error: 'Desktop compatibility contract is not accepted.',
        })
    })

    it.each([undefined, '0.5', 'v0.5.0'])('rejects invalid desktop version headers: %s', async desktopVersion => {
        const headers = new Headers({ Accept: desktopCompatibilityAccept })

        if (desktopVersion) {
            headers.set('X-AI-Mind-Desktop-Version', desktopVersion)
        }

        const response = await GET(createRequest(headers))

        expect(response.status).toBe(400)
        expect(response.headers.get('Cache-Control')).toBe('no-store')
        expect(response.headers.get('Set-Cookie')).toBeNull()
        await expect(response.json()).resolves.toEqual({
            code: 'DESKTOP_COMPATIBILITY_VERSION_INVALID',
            error: 'Desktop version is invalid.',
        })
    })
})
