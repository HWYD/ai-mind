import { NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { chatRequestSchema } from '../../../lib/ai/chat-schema'
import { createChatService } from '../../../lib/ai/chat-service'

export const runtime = 'nodejs'

const chatService = createChatService({
    defaultModel: 'qwen3:4b',
})

function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

export async function POST(request: NextRequest) {
    try {
        const json = await request.json()
        const payload = chatRequestSchema.parse(json)

        return await chatService.streamChat(payload, {
            signal: request.signal,
        })
    } catch (error) {
        if (isAbortError(error)) {
            return new Response('Request cancelled', { status: 499 })
        }

        if (error instanceof ZodError) {
            return Response.json(
                {
                    error: 'Invalid chat request',
                    issues: error.issues,
                },
                { status: 400 }
            )
        }
        // eslint-disable-next-line no-console
        console.error('Chat API error:', error)

        return Response.json(
            {
                error: 'Internal server error',
            },
            { status: 500 }
        )
    }
}
