import { type NextRequest } from 'next/server'

import { deriveContextBudget, getModelProviderConfig, ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider'
import { resolveSessionId } from '@/lib/ai/rate-limit'
import {
    buildChatConversationThreadId,
    chatMemoryService,
    conversationIdSchema,
    conversationRegistryService,
    estimateChatMemoryTokens,
} from '@/lib/ai/runtime/chat-memory'
import { chatMemoryUsageSummarySchema } from '@/lib/ai/runtime/chat-memory/context-usage-contract'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    const parsedConversationId = conversationIdSchema.safeParse(request.nextUrl.searchParams.get('conversationId'))
    const modelId = request.nextUrl.searchParams.get('modelId')?.trim()

    if (!parsedConversationId.success) {
        return Response.json(
            {
                code: 'INVALID_CONVERSATION_ID',
                error: 'conversationId is required for chat memory usage.',
            },
            { status: 400 }
        )
    }

    if (!modelId) {
        return Response.json(
            {
                code: 'INVALID_MODEL_ID',
                error: 'modelId is required for chat memory usage.',
            },
            { status: 400 }
        )
    }

    const conversationId = parsedConversationId.data
    const { sessionId, setCookie } = resolveSessionId(request.cookies)
    const headers = setCookie
        ? {
              'Set-Cookie': setCookie,
          }
        : undefined
    const conversation = await conversationRegistryService.getConversation(sessionId, conversationId)

    if (!conversation) {
        return Response.json(
            {
                code: 'CONVERSATION_NOT_FOUND',
                error: 'Conversation was not found in the current browser session registry.',
            },
            {
                headers,
                status: 404,
            }
        )
    }

    try {
        const selectedModel = resolveModelSelection({
            modelId,
            routeType: 'chat',
        })
        const config = getModelProviderConfig()
        const environment = selectedModel.provider === 'ollama' ? 'ollama' : 'cloud'
        const budget = deriveContextBudget({
            environment,
            maxOutputTokens: config.chatMaxOutputTokens,
            operationalCapTokens: environment === 'ollama' ? config.ollamaContextTokens : config.operationalContextCapTokens,
            physicalWindowTokens: selectedModel.catalogItem.contextWindowTokens,
        })
        const threadId = buildChatConversationThreadId(sessionId, conversationId)
        const memory = await chatMemoryService.readThreadState(threadId)
        const usedPercent = Math.round((estimateChatMemoryTokens(memory.state) / budget.effectiveWindowTokens) * 100)

        return Response.json(chatMemoryUsageSummarySchema.parse({ effectiveWindowTokens: budget.effectiveWindowTokens, usedPercent }), {
            headers,
        })
    } catch (error) {
        if (error instanceof ModelSelectionError) {
            return Response.json(
                {
                    code: 'CHAT_CONTEXT_USAGE_MODEL_UNAVAILABLE',
                    error: 'Selected chat model is unavailable for context usage.',
                },
                {
                    headers,
                    status: 400,
                }
            )
        }

        return Response.json(
            {
                code: 'CHAT_CONTEXT_USAGE_UNAVAILABLE',
                error: 'Chat memory usage is temporarily unavailable.',
            },
            {
                headers,
                status: 503,
            }
        )
    }
}
