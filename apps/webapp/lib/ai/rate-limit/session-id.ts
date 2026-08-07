import { createId } from '@/lib/ai/create-id'

const SESSION_COOKIE_NAME = 'ai-mind-session-id'
const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

function resolveSecureAttribute(env: Record<string, string | undefined>) {
    const value = env.AI_MIND_SESSION_COOKIE_SECURE?.trim()

    if (env.NODE_ENV === 'production' && value !== 'on') {
        throw new Error('AI_MIND_SESSION_COOKIE_SECURE must be "on" in production.')
    }

    if (!value || value === 'off') {
        return ''
    }

    if (value === 'on') {
        return '; Secure'
    }

    throw new Error('AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".')
}

/**
 * Read the session id and issue the same session cookie with a sliding lifetime.
 */
export function resolveSessionId(
    cookies: { get: (name: string) => { value: string } | undefined },
    env: Record<string, string | undefined> = process.env
): {
    sessionId: string
    setCookie: string
} {
    const secureAttribute = resolveSecureAttribute(env)
    const existing = cookies.get(SESSION_COOKIE_NAME)
    const sessionId = existing?.value || createId()
    const expires = new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000).toUTCString()

    return {
        sessionId,
        setCookie: `${SESSION_COOKIE_NAME}=${sessionId}; Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}; Expires=${expires}; HttpOnly; SameSite=Lax; Path=/${secureAttribute}`,
    }
}
