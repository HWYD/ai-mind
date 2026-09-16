import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'

import type { AiMindChatModelHandle, ResolvedModelSelection } from '@/lib/ai/model-provider'
import type { SkillDefinition } from '@/lib/ai/skills'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import type { ChatRequest } from '@/lib/ai/types/chat'

import type { GeneralReActPhaseModelOptions } from './general-react-agent/agent-context'

export interface ChatExecutionContext {
    runDeadlineAtMs?: number
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

export interface PreparedGeneralChatContext {
    messages: BaseMessage[]
    nonMessagePayloads: unknown[]
}

export interface ResolvedChatExecutionContext extends ChatExecutionContext {
    resolvedModelSelection: ResolvedModelSelection
}

export type WriteChunk = (chunk: ChatStreamChunk) => unknown

export interface ChatSession {
    request: ChatRequest
    baseModel: BaseChatModel
    createPhaseModel: (options: GeneralReActPhaseModelOptions) => BaseChatModel
    modelHandle: AiMindChatModelHandle
    skillDefinition?: SkillDefinition
    skillSystemPrompt?: string
    skillOutputPolicyPrompt?: string
    activeToolCapabilityIds: Record<string, string>
    activeToolDefinitionMap: Map<string, ChatToolDefinition>
    activeTools: ChatToolDefinition[]
    activeToolNames: string[]
    actionSystemPrompts: string[]
    answerSystemPrompts: string[]
    langChainMessages: BaseMessage[]
    toolUseSystemPrompt?: string
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

export interface ExecutedToolResult {
    attemptCount?: number
    failureCategory?: import('./tool-runtime/execution').ToolExecutionFailureCategory
    toolCall: ToolCall
    toolMessage: ToolMessage
    output: string
    rawResult?: unknown
    retryable?: boolean
    success: boolean
}

export interface StreamResult {
    body: ReadableStream<Uint8Array>
    headers: Record<string, string>
}
