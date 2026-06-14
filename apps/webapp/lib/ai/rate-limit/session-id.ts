import { createId } from '@/lib/ai/create-id'

const SESSION_COOKIE_NAME = 'ai-mind-session-id'

/**
 * 从 cookie 中读取 sessionId，不存在时生成新的并返回 Set-Cookie value。
 */
export function resolveSessionId(cookies: { get: (name: string) => { value: string } | undefined }): {
    sessionId: string
    setCookie: string | null
} {
    const existing = cookies.get(SESSION_COOKIE_NAME)

    if (existing?.value) {
        return { sessionId: existing.value, setCookie: null }
    }

    const sessionId = createId()

    return {
        sessionId,
        setCookie: `${SESSION_COOKIE_NAME}=${sessionId}; HttpOnly; SameSite=Lax; Path=/`,
    }
}
