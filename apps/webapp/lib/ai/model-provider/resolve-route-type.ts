import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ModelRouteType } from './types'

/**
 * 解析普通请求的 routeType：
 * - Composer command 是 /tasklist 且引用 docs://versions/*.md 的，视作 tasklist。
 * - 其余为 chat。
 *
 * 不把 /summary 视作独立 routeType，它在普通 chat 窗口完成，不额外分层。
 */
export function resolveRouteType(request: ChatRequest): ModelRouteType {
    const command = request.composer?.command?.name

    if (command !== 'tasklist') {
        return 'chat'
    }

    const hasVersionPlanReference =
        Array.isArray(request.composer?.references) &&
        request.composer.references.some(reference => /^docs:\/\/versions\/.*\.md$/i.test(reference.uri))

    return hasVersionPlanReference ? 'tasklist' : 'chat'
}
