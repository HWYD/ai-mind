import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import type { BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'

import type { SkillDefinition } from '@/lib/ai/skills'
import type { ChatToolDefinition } from '@/lib/ai/tools'
import type { ChatRequest } from '@/lib/ai/types/chat'

export interface ChatExecutionContext {
    signal?: AbortSignal
}

export interface ChatServiceDependencies {
    defaultModel: string
    baseUrl?: string
}

export type WriteChunk = (chunk: ChatStreamChunk) => void

export interface ChatSession {
    request: ChatRequest
    baseModel: ChatOllama
    toolBoundModel: ReturnType<ChatOllama['bindTools']> | null
    skillDefinition?: SkillDefinition
    skillSystemPrompt?: string
    skillOutputPolicyPrompt?: string
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
    success: boolean
}

export interface StreamResult {
    body: ReadableStream<Uint8Array>
    headers: Record<string, string>
}
