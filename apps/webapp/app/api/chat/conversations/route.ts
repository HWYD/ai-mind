import { type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'

import { resolveSessionId } from '@/lib/ai/rate-limit'
import { conversationIdSchema, ConversationRegistryNotFoundError, conversationRegistryService } from '@/lib/ai/runtime/chat-memory'

export const runtime = 'nodejs'

const selectConversationRequestSchema = z
    .object({
        conversationId: conversationIdSchema,
    })
    .strict()

function buildResponseHeaders(setCookie: string | null) {
    return setCookie
        ? {
              'Set-Cookie': setCookie,
          }
        : undefined
}

function toConversationRegistryResponse(
    registry: Awaited<ReturnType<typeof conversationRegistryService.ensureRegistry>>,
    setCookie: string | null
) {
    return Response.json(conversationRegistryService.toConversationRegistryPayload(registry), {
        headers: buildResponseHeaders(setCookie),
    })
}

export async function GET(request: NextRequest) {
    try {
        const { sessionId, setCookie } = resolveSessionId(request.cookies)
        const hintedConversationId = conversationIdSchema.safeParse(request.nextUrl.searchParams.get('conversationId')).success
            ? conversationIdSchema.parse(request.nextUrl.searchParams.get('conversationId'))
            : undefined
        let registry = await conversationRegistryService.ensureRegistry(sessionId)

        if (hintedConversationId && registry.selectedConversationId !== hintedConversationId) {
            const hintedConversation = registry.conversations.find(conversation => conversation.id === hintedConversationId)

            if (hintedConversation) {
                registry = await conversationRegistryService.selectConversation(sessionId, hintedConversationId)
            }
        }

        return toConversationRegistryResponse(registry, setCookie)
    } catch {
        return Response.json(
            {
                code: 'CONVERSATION_REGISTRY_UNAVAILABLE',
                error: 'Conversation registry is temporarily unavailable.',
            },
            { status: 500 }
        )
    }
}

export async function POST(request: NextRequest) {
    try {
        const json = await request.json().catch(() => ({}))
        const payload = selectConversationRequestSchema.parse(json)
        const { sessionId, setCookie } = resolveSessionId(request.cookies)
        const registry = await conversationRegistryService.selectConversation(sessionId, payload.conversationId)

        return toConversationRegistryResponse(registry, setCookie)
    } catch (error) {
        if (error instanceof ZodError) {
            return Response.json(
                {
                    code: 'INVALID_CONVERSATION_REQUEST',
                    error: 'Invalid conversation request.',
                    issues: error.issues,
                },
                { status: 400 }
            )
        }

        if (error instanceof ConversationRegistryNotFoundError) {
            return Response.json(
                {
                    code: 'CONVERSATION_NOT_FOUND',
                    error: 'Conversation was not found in the current browser session registry.',
                },
                { status: 404 }
            )
        }

        return Response.json(
            {
                code: 'CONVERSATION_REGISTRY_UNAVAILABLE',
                error: 'Conversation registry is temporarily unavailable.',
            },
            { status: 500 }
        )
    }
}
