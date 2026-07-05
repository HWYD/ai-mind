import type { ChatRequest, ChatRequestInput } from '@/lib/ai/types/chat'

import type { ModelRouteType } from './types'

/**
 * 解析普通请求的 routeType。
 * - Composer command 是 `/delivery-chain` 时，显式视作 delivery-chain。
 * - Composer command 是 `/tasklist` 且引用 `demo://version-plans/*.md` 时，视作 tasklist。
 * - 其余请求仍走普通 chat。
 */
export function resolveRouteType(request: ChatRequest | ChatRequestInput): ModelRouteType {
    const command = request.composer?.command?.name

    if (command === 'delivery-chain') {
        return 'delivery-chain'
    }

    if (command !== 'tasklist') {
        return 'chat'
    }

    const hasVersionPlanReference =
        Array.isArray(request.composer?.references) &&
        request.composer.references.some(reference => /^demo:\/\/version-plans\/.*\.md$/i.test(reference.uri))

    return hasVersionPlanReference ? 'tasklist' : 'chat'
}
