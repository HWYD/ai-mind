import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { chatRequestSchema } from '@/lib/ai/chat-schema'
import { createChatService } from '@/lib/ai/chat-service'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider/catalog/resolve-model-selection'
import { resolveRouteType } from '@/lib/ai/model-provider/resolve-route-type'
import { InputLengthExceededError, validateInputLength } from '@/lib/ai/model-provider/validate-input-length'
import { getRateLimitConfig, MemoryRateLimitStore, resolveClientIp, resolveSessionId } from '@/lib/ai/rate-limit'
import { validateExplicitSkillForRequest } from '@/lib/ai/skills/router'
import type { ChatRequest } from '@/lib/ai/types/chat'

export const runtime = 'nodejs'

const chatService = createChatService()

const rateLimitConfig = getRateLimitConfig()
const rateLimitStore = new MemoryRateLimitStore(rateLimitConfig)

function getMessagesForInputLengthValidation(payload: ChatRequest, routeType: ReturnType<typeof resolveRouteType>) {
    if (routeType !== 'tasklist') {
        return payload.messages
    }

    // /tasklist 受控入口只消费当前这一轮用户目标和选中的 version plan。
    // 历史对话过长不应在进入 Agent 前就把整条链路拦死。
    for (let index = payload.messages.length - 1; index >= 0; index -= 1) {
        const message = payload.messages[index]

        if (message.role === 'user') {
            return [message]
        }
    }

    return payload.messages
}

export async function POST(request: NextRequest) {
    try {
        const json = await request.json()
        const payload = chatRequestSchema.parse(json)
        validateExplicitSkillForRequest(payload)

        const routeType = resolveRouteType(payload)
        const resolvedModelSelection = resolveModelSelection({
            modelId: payload.options?.modelId,
            routeType,
        })

        validateInputLength(getMessagesForInputLengthValidation(payload, routeType))

        const clientIp = resolveClientIp(request)
        const { sessionId, setCookie } = resolveSessionId(request.cookies)

        const rateLimitResult = rateLimitStore.checkAndIncrement({
            ip: clientIp,
            routeType,
            sessionId,
        })

        if (!rateLimitResult.allowed) {
            const routeLabel = routeType === 'tasklist' ? '任务清单' : routeType === 'delivery-chain' ? '交付链路' : '聊天'
            const limitScopeLabel = rateLimitResult.limitKey === 'session' ? '当前会话' : '当前 IP'

            return Response.json(
                {
                    error: `${routeLabel}请求已达到${limitScopeLabel}的当日上限（${rateLimitResult.limitValue} 次）。`,
                    code: 'MODEL_PROVIDER_RATE_LIMITED',
                    limitKey: rateLimitResult.limitKey,
                },
                { status: 429 }
            )
        }

        return await chatService.streamChat(payload, {
            sessionId,
            signal: request.signal,
            resolvedModelSelection,
            setCookie,
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
