import { createId } from '@/lib/ai/create-id'

const SESSION_COOKIE_NAME = 'ai-mind-session-id'

function resolveSecureAttribute(env: Record<string, string | undefined>) {
    const value = env.AI_MIND_SESSION_COOKIE_SECURE?.trim()

    if (!value || value === 'off') {
        return ''
    }

    if (value === 'on') {
        return '; Secure'
    }

    throw new Error('AI_MIND_SESSION_COOKIE_SECURE must be either "on" or "off".')
}

/**
 * 从 cookie 中读取 sessionId，不存在时生成新的并返回 Set-Cookie value。
 */
export function resolveSessionId(
    cookies: { get: (name: string) => { value: string } | undefined },
    env: Record<string, string | undefined> = process.env
): {
    sessionId: string
    setCookie: string | null
} {
    const secureAttribute = resolveSecureAttribute(env)
    const existing = cookies.get(SESSION_COOKIE_NAME)

    if (existing?.value) {
        return { sessionId: existing.value, setCookie: null }
    }

    const sessionId = createId()

    return {
        sessionId,
        setCookie: `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/${secureAttribute}`,
    }
}
