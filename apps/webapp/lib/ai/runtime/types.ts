import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'
import type { Runnable } from '@langchain/core/runnables'

import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { SkillDefinition } from '@/lib/ai/skills'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import type { ChatRequest } from '@/lib/ai/types/chat'

export interface ChatExecutionContext {
    sessionId?: string
    setCookie?: string | null
    signal?: AbortSignal
    streamRecovery?: {
        ownerSessionHash: string
        requestSignal?: AbortSignal
        runId: string
    }
    validatedConversationId?: string
}

export interface ResolvedChatExecutionContext extends ChatExecutionContext {
    resolvedModelSelection: ResolvedModelSelection
}

export type WriteChunk = (chunk: ChatStreamChunk) => void

export interface ChatSession {
    request: ChatRequest
    baseModel: BaseChatModel
    modelHandle: AiMindChatModelHandle
    toolBoundModel: Runnable | null
    skillDefinition?: SkillDefinition
    skillSystemPrompt?: string
    skillOutputPolicyPrompt?: string
    activeToolCapabilityIds: Record<string, string>
    activeToolDefinitionMap: Map<string, ChatToolDefinition>
    activeTools: ChatToolDefinition[]
    activeToolNames: string[]
    langChainMessages: BaseMessage[]
    directAnswerMessages: BaseMessage[]
    toolUseSystemPrompt?: string
    toolRetrySystemPrompt?: string
    toolResultSystemPrompt?: string
}

export interface ToolValidationError {
    id: string
    toolName: string
    title?: string
    action?: string
    input: string
    message: string
    outputPartType: 'resource' | 'tool'
    resourceName?: string
    serverId?: string
    source: 'internal' | 'mcp'
    location: 'local' | 'remote'
    uri?: string
}

export interface ToolValidationResult {
    planningMessage: import('@langchain/core/messages').AIMessage
    toolCalls: ToolCall[]
    toolErrors: ToolValidationError[]
}

export interface ExecutedToolResult {
    toolCall: ToolCall
    toolMessage: ToolMessage
    output: string
    rawResult?: unknown
    success: boolean
}

export interface StreamResult {
    body: ReadableStream<Uint8Array>
    headers: Record<string, string>
}
