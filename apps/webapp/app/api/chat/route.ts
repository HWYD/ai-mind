import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { chatRequestSchema } from '@/lib/ai/chat-schema'
import { createChatService } from '@/lib/ai/chat-service'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider/catalog/resolve-model-selection'
import { resolveRouteType } from '@/lib/ai/model-provider/resolve-route-type'
import { InputLengthExceededError, validateInputLength } from '@/lib/ai/model-provider/validate-input-length'
import { getRateLimitConfig, MemoryRateLimitStore, resolveClientIp, resolveSessionId } from '@/lib/ai/rate-limit'
import { conversationRegistryService } from '@/lib/ai/runtime/chat-memory'
import { validateExplicitSkillForRequest } from '@/lib/ai/skills/router'
import type { ChatRequest, ChatRequestInput } from '@/lib/ai/types/chat'

export const runtime = 'nodejs'

const chatService = createChatService()

const rateLimitConfig = getRateLimitConfig()
const rateLimitStore = new MemoryRateLimitStore(rateLimitConfig)

function getMessagesForInputLengthValidation(payload: Pick<ChatRequestInput, 'messages'>) {
    // Server-authoritative runtime 只消费当前 user turn；历史上下文由后端 ThreadState 或受控 Agent/Workflow 自己提供。
    // 前端历史 payload 只用于 UI 兼容，不应该反过来阻断有效的当前请求。
    for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
        const message = payload.messages[index]

        if (message.role === 'user') {
            return [message]
        }
    }

    return payload.messages
}

function isDraftCreateRequest(payload: ChatRequestInput): payload is Extract<ChatRequestInput, { createConversation: true }> {
    return 'createConversation' in payload && payload.createConversation === true
}

function buildRateLimitedErrorMessage(routeType: ReturnType<typeof resolveRouteType>, limitKey: 'ip' | 'session', limitValue: number) {
    const routeLabel = routeType === 'tasklist' ? '任务清单' : routeType === 'delivery-chain' ? '交付链路' : '聊天'
    const limitScopeLabel = limitKey === 'session' ? '当前会话' : '当前 IP'

    return `${routeLabel}请求已达到${limitScopeLabel}的当日上限（${limitValue} 次）。`
}

export async function POST(request: NextRequest) {
    try {
        const json = await request.json()
        const payload = chatRequestSchema.parse(json) as ChatRequestInput
        validateExplicitSkillForRequest(payload)

        const routeType = resolveRouteType(payload)
        const resolvedModelSelection = resolveModelSelection({
            modelId: payload.options?.modelId,
            routeType,
        })

        validateInputLength(getMessagesForInputLengthValidation(payload))

        const clientIp = resolveClientIp(request)
        const { sessionId, setCookie } = resolveSessionId(request.cookies)

        if (!isDraftCreateRequest(payload)) {
            const ownedConversation = await conversationRegistryService.getConversation(sessionId, payload.conversationId)

            if (!ownedConversation) {
                return Response.json(
                    {
                        code: 'CONVERSATION_NOT_FOUND',
                        error: 'Conversation was not found in the current browser session registry.',
                    },
                    { status: 404 }
                )
            }
        }

        const rateLimitResult = rateLimitStore.checkAndIncrement({
            ip: clientIp,
            routeType,
            sessionId,
        })

        if (!rateLimitResult.allowed) {
            return Response.json(
                {
                    error: buildRateLimitedErrorMessage(routeType, rateLimitResult.limitKey, rateLimitResult.limitValue),
                    code: 'MODEL_PROVIDER_RATE_LIMITED',
                    limitKey: rateLimitResult.limitKey,
                },
                { status: 429 }
            )
        }

        const userText = getMessagesForInputLengthValidation(payload)[0]
            ?.parts.map(part => ('text' in part ? part.text : ''))
            .join('\n')
            .trim()

        let validatedConversationId: string

        if (isDraftCreateRequest(payload)) {
            const registry = await conversationRegistryService.createConversation(sessionId, {
                hasMessages: true,
                now: new Date().toISOString(),
                userText,
            })
            validatedConversationId = registry.selectedConversationId ?? registry.conversations[0]?.id ?? ''
        } else {
            await conversationRegistryService.touchConversation(sessionId, payload.conversationId, {
                markSelected: true,
                userText,
            })
            validatedConversationId = payload.conversationId
        }

        const normalizedPayload: ChatRequest = {
            composer: payload.composer,
            conversationId: validatedConversationId,
            messages: payload.messages,
            options: payload.options,
        }

        const response = await chatService.streamChat(normalizedPayload, {
            sessionId,
            signal: request.signal,
            resolvedModelSelection,
            setCookie,
            validatedConversationId,
        })

        const headers = new Headers(response.headers)
        headers.set('X-AI-Mind-Conversation-Id', validatedConversationId)

        return new Response(response.body, {
            headers,
            status: response.status,
            statusText: response.statusText,
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

        if (error instanceof ModelSelectionError) {
            return Response.json(
                {
                    error: error.message,
                    code: error.code,
                    modelId: error.modelId,
                },
                { status: 400 }
            )
        }

        if (error instanceof InputLengthExceededError) {
            return Response.json(
                {
                    error: error.message,
                    code: error.code,
                    maxChars: error.maxChars,
                    actualChars: error.actualChars,
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
