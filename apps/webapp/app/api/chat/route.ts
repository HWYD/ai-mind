import { createHash } from 'node:crypto'

import { type NextRequest } from 'next/server'
import { ZodError } from 'zod'

import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs'
import { chatRequestSchema } from '@/lib/ai/chat-schema'
import { createChatService } from '@/lib/ai/chat-service'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import { ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider/catalog/resolve-model-selection'
import { resolveRouteType } from '@/lib/ai/model-provider/resolve-route-type'
import { InputLengthExceededError, validateInputLength } from '@/lib/ai/model-provider/validate-input-length'
import { getRateLimitConfig, MemoryRateLimitStore, resolveClientIp, resolveSessionId } from '@/lib/ai/rate-limit'
import { conversationRegistryService } from '@/lib/ai/runtime/chat-memory'
import { normalizeKnownRuntimeError } from '@/lib/ai/runtime/stream-errors'
import { validateExplicitSkillForRequest } from '@/lib/ai/skills/router'
import { createSafeStreamDiagnostics, RESUMABLE_STREAM_ACCEPT } from '@/lib/ai/stream-recovery/contracts'
import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamRunService, StreamRunServiceError } from '@/lib/ai/stream-recovery/stream-run-service'
import type { ChatRequest, ChatRequestInput } from '@/lib/ai/types/chat'

export const runtime = 'nodejs'

const chatService = createChatService()
let streamRunService: StreamRunService | undefined
let streamEventProjector: StreamEventProjector | undefined

const rateLimitConfig = getRateLimitConfig()
const rateLimitStore = new MemoryRateLimitStore(rateLimitConfig)
const streamProtocolHeader = 'ai-mind-resumable-v1'

function getStreamRunService() {
    streamRunService ??= new StreamRunService()

    return streamRunService
}

function getStreamEventProjector() {
    streamEventProjector ??= new StreamEventProjector()

    return streamEventProjector
}

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

function createResumableDiagnostics(input: Parameters<typeof createSafeStreamDiagnostics>[0]) {
    return { diagnostics: createSafeStreamDiagnostics(input) }
}

function resolveStreamRunKind(routeType: ReturnType<typeof resolveRouteType>) {
    if (routeType === 'delivery-chain') {
        return 'delivery_chain'
    }

    if (routeType === 'tasklist') {
        return 'tasklist_agent'
    }

    return 'chat'
}

function createResumableDraftConversationId(ownerSessionHash: string, idempotencyKey: string): string {
    const digest = createHash('sha256').update(`${ownerSessionHash}:${idempotencyKey}`).digest('hex')

    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
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
        const idempotencyKey = request.headers.get('Idempotency-Key')?.trim()

        if (!idempotencyKey) {
            return Response.json(
                {
                    code: 'INVALID_CHAT_REQUEST',
                    diagnostics: createSafeStreamDiagnostics({
                        errorCode: 'INVALID_CHAT_REQUEST',
                        retryable: false,
                    }),
                    error: 'Idempotency-Key is required for chat stream requests.',
                },
                { status: 400 }
            )
        }

        const ownerSessionHash = createAgentRunOwnerSessionHash(sessionId)
        const draftConversationId = createResumableDraftConversationId(ownerSessionHash, idempotencyKey)

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

        const userText = getMessagesForInputLengthValidation(payload)[0]
            ?.parts.map(part => ('text' in part ? part.text : ''))
            .join('\n')
            .trim()

        let validatedConversationId: string

        if (isDraftCreateRequest(payload) && draftConversationId) {
            validatedConversationId = draftConversationId
        } else if (isDraftCreateRequest(payload)) {
            const registry = await conversationRegistryService.createConversation(sessionId, {
                hasMessages: true,
                now: new Date().toISOString(),
                userText,
            })
            validatedConversationId = registry.selectedConversationId ?? registry.conversations[0]?.id ?? ''
        } else {
            validatedConversationId = payload.conversationId
        }

        if (!validatedConversationId.trim()) {
            throw new Error('Persisted conversation promotion did not return a valid conversationId.')
        }

        const normalizedPayload: ChatRequest = {
            composer: payload.composer,
            conversationId: validatedConversationId,
            messages: payload.messages,
            options: payload.options,
        }

        const streamService = getStreamRunService()
        const hasReusableRequest =
            typeof streamService.hasReusableRequest === 'function' &&
            (await streamService.hasReusableRequest({
                idempotencyKey,
                ownerSessionHash,
            }))

        if (!hasReusableRequest) {
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
        }

        const streamRunResult = await streamService.createOrReuseRun({
            idempotencyKey,
            kind: resolveStreamRunKind(routeType),
            ownerSessionHash,
            request: normalizedPayload,
        })

        if (streamRunResult.type === 'replay') {
            if (!hasReusableRequest) {
                rateLimitStore.rollback?.({ ip: clientIp, sessionId })
            }
            return Response.json(streamRunResult.descriptor, {
                headers: {
                    'X-AI-Mind-Conversation-Id': validatedConversationId,
                    'X-Run-Id': streamRunResult.descriptor.runId,
                    'X-Stream-Protocol': streamProtocolHeader,
                },
            })
        }

        if (isDraftCreateRequest(payload) && streamRunResult.type === 'created') {
            try {
                await conversationRegistryService.createConversation(sessionId, {
                    conversationId: validatedConversationId,
                    hasMessages: true,
                    now: new Date().toISOString(),
                    userText,
                })
            } catch (error) {
                try {
                    await getStreamEventProjector().projectLifecycle({
                        code: 'DRAFT_CONVERSATION_REGISTRATION_FAILED',
                        message: '会话初始化失败，当前运行已停止。',
                        ownerSessionHash,
                        runId: streamRunResult.run.id,
                        status: 'failed',
                    })
                } catch {
                    // eslint-disable-next-line no-console
                    console.error('Unable to terminalize StreamRun after draft conversation registration failure.', {
                        runId: streamRunResult.run.id,
                    })
                }

                throw error
            }
        }

        if (!isDraftCreateRequest(payload) && streamRunResult.type === 'created') {
            await conversationRegistryService.touchConversation(sessionId, validatedConversationId, {
                markSelected: true,
                userText,
            })
        }

        const response = await chatService.streamChat(normalizedPayload, {
            sessionId,
            signal: undefined,
            resolvedModelSelection,
            setCookie,
            streamRecovery: {
                ownerSessionHash,
                requestSignal: request.signal,
                runId: streamRunResult.run.id,
            },
            validatedConversationId,
        })

        const headers = new Headers(response.headers)
        headers.set('X-AI-Mind-Conversation-Id', validatedConversationId)

        headers.set('X-Run-Id', streamRunResult.run.id)
        headers.set('X-Stream-Protocol', streamProtocolHeader)
        headers.set('Content-Type', RESUMABLE_STREAM_ACCEPT)

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
                    ...createResumableDiagnostics({
                        retryable: false,
                    }),
                },
                { status: 499 }
            )
        }

        if (error instanceof ZodError) {
            return Response.json(
                {
                    error: 'Invalid chat request',
                    code: 'INVALID_CHAT_REQUEST',
                    ...createResumableDiagnostics({
                        errorCode: 'INVALID_CHAT_REQUEST',
                        retryable: false,
                    }),
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
                    ...createResumableDiagnostics({
                        errorCode: 'INVALID_CHAT_REQUEST',
                        retryable: false,
                    }),
                },
                { status: 400 }
            )
        }

        if (error instanceof ModelSelectionError) {
            return Response.json(
                {
                    error: error.message,
                    code: error.code,
                    ...createResumableDiagnostics({
                        errorCode: 'INVALID_CHAT_REQUEST',
                        retryable: false,
                    }),
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
                    ...createResumableDiagnostics({
                        errorCode: 'INVALID_CHAT_REQUEST',
                        retryable: false,
                    }),
                    maxChars: error.maxChars,
                    actualChars: error.actualChars,
                },
                { status: 400 }
            )
        }

        if (error instanceof StreamRunServiceError) {
            if (error.code === 'IDEMPOTENCY_CONFLICT') {
                return Response.json(
                    {
                        code: 'IDEMPOTENCY_CONFLICT',
                        diagnostics: createSafeStreamDiagnostics({
                            errorCode: 'IDEMPOTENCY_CONFLICT',
                            retryable: false,
                        }),
                        error: error.message,
                    },
                    { status: 409 }
                )
            }

            return Response.json(
                {
                    code: error.code,
                    diagnostics: createSafeStreamDiagnostics({
                        errorCode: error.code,
                        retryable: false,
                    }),
                    error: error.message,
                },
                { status: 400 }
            )
        }

        const knownRuntimeError = normalizeKnownRuntimeError(error)

        if (knownRuntimeError) {
            // 只返回已归一化的配置/数据层提示，不把 Prisma、provider 或连接字符串细节暴露给客户端。
            // eslint-disable-next-line no-console
            console.error('Chat API known runtime error:', {
                code: knownRuntimeError.code,
                retryable: knownRuntimeError.retryable,
            })

            return Response.json(
                {
                    code: 'STREAM_SERVICE_UNAVAILABLE',
                    diagnostics: createSafeStreamDiagnostics({
                        errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                        retryable: knownRuntimeError.retryable,
                    }),
                    error: knownRuntimeError.message,
                },
                { status: knownRuntimeError.retryable ? 503 : 500 }
            )
        }

        // eslint-disable-next-line no-console
        console.error('Chat API error:', error)

        return Response.json(
            {
                error: 'Internal server error',
                code: 'RUNTIME_INVARIANT_FAILED',
                ...createResumableDiagnostics({
                    errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                    retryable: false,
                }),
            },
            { status: 500 }
        )
    }
}
