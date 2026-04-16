import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { chatRequestSchema } from '@/lib/ai/chat-schema'
import { createChatService } from '@/lib/ai/chat-service'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { validateExplicitSkillForRequest } from '@/lib/ai/skills/router'

export const runtime = 'nodejs'

const chatService = createChatService({
    defaultModel: 'qwen3:8b',
})

export async function POST(request: NextRequest) {
    try {
        const json = await request.json()
        const payload = chatRequestSchema.parse(json)
        validateExplicitSkillForRequest(payload)
        return await chatService.streamChat(payload, {
            signal: request.signal,
        })
    } catch (error) {
        if (isAbortError(error)) {
            return Response.json(
                {
                    error: 'Request cancelled',
                    code: 'REQUEST_ABORTED',
                },
                { status: 499 }
            )
        }

        if (error instanceof ZodError) {
            return Response.json(
                {
                    error: 'Invalid chat request',
                    code: 'INVALID_CHAT_REQUEST',
                    issues: error.issues,
                },
                { status: 400 }
            )
        }

        if (isInvalidSkillError(error)) {
            return Response.json(
                {
                    error: error.message,
                    code: 'INVALID_SKILL',
                },
                { status: 400 }
            )
        }
        // eslint-disable-next-line no-console
        console.error('Chat API error:', error)

        return Response.json(
            {
                error: 'Internal server error',
                code: 'RUNTIME_INVARIANT_FAILED',
            },
            { status: 500 }
        )
    }
}
