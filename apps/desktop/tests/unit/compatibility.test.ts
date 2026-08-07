import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDesktopBuildConfig } from '../../src/main/build-config'
import { checkDesktopCompatibility } from '../../src/main/compatibility'
import { DesktopHostStateMachine } from '../../src/main/host-state'

const compatibilityAccept = 'application/vnd.ai-mind.desktop-compatibility+json; version=1'

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
})

function createBuildConfig() {
    return createDesktopBuildConfig({
        desktopVersion: '0.5.0',
        developmentOrigin: 'http://localhost:3000',
        isPackaged: false,
    })
}

function createAttempt(attemptId = 1, deadlineAt = Date.now() + 5_000) {
    return { attemptId, deadlineAt }
}

function jsonResponse(body: unknown, status = 200, contentType = 'application/json') {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': contentType },
        status,
    })
}

describe('desktop compatibility check', () => {
    it('uses the workspace session to make the fixed, credential-free v1 request', async () => {
        const fetch = vi.fn().mockResolvedValue(jsonResponse({ contractVersion: 1, status: 'compatible' }))
        const config = createBuildConfig()

        await expect(checkDesktopCompatibility({ attempt: createAttempt(), config, session: { fetch } })).resolves.toEqual({
            attemptId: 1,
            kind: 'compatible',
        })

        expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/desktop/compatibility', {
            credentials: 'omit',
            headers: {
                accept: compatibilityAccept,
                'x-ai-mind-desktop-version': '0.5.0',
            },
            method: 'GET',
            signal: expect.any(AbortSignal),
        })
    })

    it('accepts only the strict v1 responses and requires an upgrade minimum above the current release', async () => {
        const config = createBuildConfig()
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, minimumDesktopVersion: '0.5.1', status: 'manual_upgrade_required' }))
            .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, status: 'compatible', unexpected: true }))
            .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, minimumDesktopVersion: '0.5.0', status: 'manual_upgrade_required' }))
            .mockResolvedValueOnce(jsonResponse({ contractVersion: 1, status: 'compatible' }, 200, 'text/html'))

        await expect(checkDesktopCompatibility({ attempt: createAttempt(1), config, session: { fetch } })).resolves.toEqual({
            attemptId: 1,
            kind: 'manual_upgrade_required',
            minimumDesktopVersion: '0.5.1',
        })

        await expect(checkDesktopCompatibility({ attempt: createAttempt(2), config, session: { fetch } })).resolves.toEqual({
            attemptId: 2,
            errorCode: 'COMPATIBILITY_CONTRACT_INVALID',
            kind: 'unavailable',
        })
        await expect(checkDesktopCompatibility({ attempt: createAttempt(3), config, session: { fetch } })).resolves.toEqual({
            attemptId: 3,
            errorCode: 'COMPATIBILITY_CONTRACT_INVALID',
            kind: 'unavailable',
        })
        await expect(checkDesktopCompatibility({ attempt: createAttempt(4), config, session: { fetch } })).resolves.toEqual({
            attemptId: 4,
            errorCode: 'COMPATIBILITY_CONTRACT_INVALID',
            kind: 'unavailable',
        })
    })

    it('maps HTTP, timeout, TLS, and other network failures to safe error codes', async () => {
        const config = createBuildConfig()
        const timeoutError = new Error('The compatibility request timed out.')
        timeoutError.name = 'AbortError'
        const fetch = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
            .mockRejectedValueOnce(timeoutError)
            .mockRejectedValueOnce(new Error('net::ERR_CERT_AUTHORITY_INVALID'))
            .mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))

        await expect(checkDesktopCompatibility({ attempt: createAttempt(1), config, session: { fetch } })).resolves.toMatchObject({
            attemptId: 1,
            errorCode: 'COMPATIBILITY_HTTP_FAILED',
            kind: 'unavailable',
        })
        await expect(checkDesktopCompatibility({ attempt: createAttempt(2), config, session: { fetch } })).resolves.toMatchObject({
            attemptId: 2,
            errorCode: 'COMPATIBILITY_TIMEOUT',
            kind: 'unavailable',
        })
        await expect(checkDesktopCompatibility({ attempt: createAttempt(3), config, session: { fetch } })).resolves.toMatchObject({
            attemptId: 3,
            errorCode: 'TLS_VALIDATION_FAILED',
            kind: 'unavailable',
        })
        await expect(checkDesktopCompatibility({ attempt: createAttempt(4), config, session: { fetch } })).resolves.toMatchObject({
            attemptId: 4,
            errorCode: 'NETWORK_UNAVAILABLE',
            kind: 'unavailable',
        })
    })

    it('uses only the current attempt deadline as the fetch timeout', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_250)
        const timeout = vi.spyOn(AbortSignal, 'timeout')
        const fetch = vi.fn().mockResolvedValue(jsonResponse({ contractVersion: 1, status: 'compatible' }))

        await checkDesktopCompatibility({
            attempt: createAttempt(1, 5_000),
            config: createBuildConfig(),
            session: { fetch },
        })

        expect(timeout).toHaveBeenCalledWith(3_750)
    })

    it('tags results with their originating attempt so an older response cannot be applied', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
        const host = new DesktopHostStateMachine(0)
        const firstAttempt = host.startCompatibilityCheck(0)
        const fetch = vi.fn().mockResolvedValue(jsonResponse({ contractVersion: 1, status: 'compatible' }))

        const result = checkDesktopCompatibility({ attempt: firstAttempt, config: createBuildConfig(), session: { fetch } })
        host.startCompatibilityCheck(100)

        await expect(result).resolves.toMatchObject({ attemptId: firstAttempt.attemptId, kind: 'compatible' })
        expect(host.canApplyAttempt(firstAttempt.attemptId, Date.now())).toBe(false)
    })
})
