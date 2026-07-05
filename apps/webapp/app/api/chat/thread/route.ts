import { type NextRequest } from 'next/server'

import { resolveSessionId } from '@/lib/ai/rate-limit'
import {
    assertNoForbiddenHydrationFields,
    buildChatConversationThreadId,
    buildThreadHydrationDTO,
    chatMemoryService,
    conversationIdSchema,
    conversationRegistryService,
    createEmptyThreadState,
} from '@/lib/ai/runtime/chat-memory'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    const parsedConversationId = conversationIdSchema.safeParse(request.nextUrl.searchParams.get('conversationId'))

    if (!parsedConversationId.success) {
        return Response.json(
            {
                code: 'INVALID_CONVERSATION_ID',
                error: 'conversationId is required for selected conversation hydration.',
            },
            { status: 400 }
        )
    }

    const conversationId = parsedConversationId.data
    const { sessionId, setCookie } = resolveSessionId(request.cookies)
    const conversation = await conversationRegistryService.getConversation(sessionId, conversationId)

    if (!conversation) {
        return Response.json(
            {
                code: 'CONVERSATION_NOT_FOUND',
                error: 'Conversation was not found in the current browser session registry.',
            },
            { status: 404 }
        )
    }

    const threadId = buildChatConversationThreadId(sessionId, conversationId)
    let dto = buildThreadHydrationDTO({
        conversationId,
        restored: false,
        state: createEmptyThreadState(),
        threadId,
    })

    try {
        const result = await chatMemoryService.readThreadState(threadId)
        dto = buildThreadHydrationDTO({
            conversationId,
            restored: result.restored,
            state: result.state,
            threadId,
        })
    } catch {
        dto = buildThreadHydrationDTO({
            conversationId,
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
