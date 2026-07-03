import { type NextRequest } from 'next/server'

import { resolveSessionId } from '@/lib/ai/rate-limit'
import {
    assertNoForbiddenHydrationFields,
    buildChatMemoryThreadId,
    buildThreadHydrationDTO,
    chatMemoryService,
    createEmptyThreadState,
} from '@/lib/ai/runtime/chat-memory'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    const { sessionId, setCookie } = resolveSessionId(request.cookies)
    const threadId = buildChatMemoryThreadId(sessionId)
    let dto = buildThreadHydrationDTO({
        restored: false,
        state: createEmptyThreadState(),
        threadId,
    })

    try {
        const result = await chatMemoryService.readThreadState(threadId)
        dto = buildThreadHydrationDTO({
            restored: result.restored,
            state: result.state,
            threadId,
        })
    } catch {
        dto = buildThreadHydrationDTO({
            restored: false,
            state: createEmptyThreadState(),
            threadId,
        })
    }

    assertNoForbiddenHydrationFields(dto)

    return Response.json(dto, {
        headers: setCookie
            ? {
                  'Set-Cookie': setCookie,
              }
            : undefined,
    })
}
