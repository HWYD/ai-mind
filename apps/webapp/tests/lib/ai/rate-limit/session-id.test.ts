import { describe, expect, it } from 'vitest'

import { resolveSessionId } from '@/lib/ai/rate-limit'

describe('resolveSessionId', () => {
    it('默认不增加 Secure', () => {
        const result = resolveSessionId(
            {
                get: () => undefined,
            },
            {}
        )

        expect(result.sessionId).toBeTruthy()
        expect(result.setCookie).toContain('HttpOnly')
        expect(result.setCookie).toContain('SameSite=Lax')
        expect(result.setCookie).toContain('Path=/')
        expect(result.setCookie).not.toContain('Secure')
    })

    it('AI_MIND_SESSION_COOKIE_SECURE=on 时增加 Secure', () => {
        const result = resolveSessionId(
            {
                get: () => undefined,
            },
            {
                AI_MIND_SESSION_COOKIE_SECURE: 'on',
            }
        )

        expect(result.setCookie).toContain('Secure')
    })

    it('非法配置 fail closed', () => {
        expect(() =>
            resolveSessionId(
                {
                    get: () => undefined,
                },
                {
                    AI_MIND_SESSION_COOKIE_SECURE: 'invalid',
                }
            )
        ).toThrow('AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".')
    })

    it('已有 Session 时仍校验 Cookie 安全配置', () => {
        expect(() =>
            resolveSessionId(
                {
                    get: () => ({ value: 'existing-session' }),
                },
                {
                    AI_MIND_SESSION_COOKIE_SECURE: 'invalid',
                }
            )
        ).toThrow('AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".')
    })

    it('已有 Session 且配置有效时不重复生成 Cookie', () => {
        const result = resolveSessionId(
            {
                get: () => ({ value: 'existing-session' }),
            },
            {
                AI_MIND_SESSION_COOKIE_SECURE: 'on',
            }
        )

        expect(result).toEqual({ sessionId: 'existing-session', setCookie: null })
    })
})
