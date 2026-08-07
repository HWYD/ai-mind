import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveSessionId } from '@/lib/ai/rate-limit'

describe('resolveSessionId', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-05T00:00:00.000Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('creates a session cookie with the fixed sliding lifetime', () => {
        const result = resolveSessionId({ get: () => undefined }, {})

        expect(result.sessionId).toBeTruthy()
        expect(result.setCookie).toContain('HttpOnly')
        expect(result.setCookie).toContain('SameSite=Lax')
        expect(result.setCookie).toContain('Path=/')
        expect(result.setCookie).toContain('Max-Age=2592000')
        expect(result.setCookie).toContain('Expires=Fri, 04 Sep 2026 00:00:00 GMT')
        expect(result.setCookie).not.toContain('Secure')
    })

    it('adds Secure when explicitly enabled', () => {
        const result = resolveSessionId({ get: () => undefined }, { AI_MIND_SESSION_COOKIE_SECURE: 'on' })

        expect(result.setCookie).toContain('Secure')
    })

    it('requires Secure in production', () => {
        expect(() => resolveSessionId({ get: () => undefined }, { NODE_ENV: 'production' })).toThrow(
            'AI_MIND_SESSION_COOKIE_SECURE must be "on" in production.'
        )
        expect(() => resolveSessionId({ get: () => undefined }, { AI_MIND_SESSION_COOKIE_SECURE: 'off', NODE_ENV: 'production' })).toThrow(
            'AI_MIND_SESSION_COOKIE_SECURE must be "on" in production.'
        )
    })

    it('fails closed for an invalid secure configuration', () => {
        expect(() => resolveSessionId({ get: () => undefined }, { AI_MIND_SESSION_COOKIE_SECURE: 'invalid' })).toThrow(
            'AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".'
        )
    })

    it('validates secure configuration even when a session already exists', () => {
        expect(() =>
            resolveSessionId({ get: () => ({ value: 'existing-session' }) }, { AI_MIND_SESSION_COOKIE_SECURE: 'invalid' })
        ).toThrow('AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".')
    })

    it('renews an existing session with the same sliding cookie', () => {
        const result = resolveSessionId({ get: () => ({ value: 'existing-session' }) }, { AI_MIND_SESSION_COOKIE_SECURE: 'on' })

        expect(result.sessionId).toBe('existing-session')
        expect(result.setCookie).toContain('ai-mind-session-id=existing-session')
        expect(result.setCookie).toContain('Max-Age=2592000')
        expect(result.setCookie).toContain('Expires=Fri, 04 Sep 2026 00:00:00 GMT')
        expect(result.setCookie).toContain('Secure')
    })
})
