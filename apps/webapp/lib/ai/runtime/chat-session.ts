import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'

import { toLangChainMessages } from '@/lib/ai/langchain-message-adapter'
import { getToolResultSystemPrompt, getToolRetrySystemPrompt, getToolUseSystemPrompt } from '@/lib/ai/prompts/tool-calling'
import type { SkillDefinition } from '@/lib/ai/skills'
import { resolveSkillDefinitionForRequest } from '@/lib/ai/skills/router'
import { type ChatToolDefinition, chatToolRegistry } from '@/lib/ai/tools'
import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ChatServiceDependencies, ChatSession } from './types'

export function buildSystemMessages(...prompts: Array<string | undefined>): BaseMessage[] {
    return prompts
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
        .map(prompt => new SystemMessage(prompt))
}

function getSkillOutputPolicyPrompt(skillDefinition?: SkillDefinition) {
    if (!skillDefinition?.outputPolicy) {
        return undefined
    }

    switch (skillDefinition.outputPolicy) {
        case 'concise-utility':
            return '请优先输出简洁、结果优先、偏实用的回答；能先给结论就先给结论，不要展开冗长过程。'
        case 'context-reader':
            return '请优先基于外部上下文先给结论，再用一到两句话补充必要来源或依据；不要展开冗长叙述，也不要假装读取了工具未返回的信息。'
    }
}

function getActiveToolDefinitions(skillDefinition?: SkillDefinition): ChatToolDefinition[] {
    if (!skillDefinition) {
        return []
    }

    const allowedToolNames = new Set(skillDefinition.allowedTools)

    return chatToolRegistry.listActive().filter(toolDefinition => allowedToolNames.has(toolDefinition.name))
}

function createBaseModel(request: ChatRequest, deps: ChatServiceDependencies) {
    return new ChatOllama({
        model: request.options?.model ?? deps.defaultModel,
        baseUrl: deps.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
        temperature: request.options?.temperature ?? 0.3,
        numPredict: request.options?.maxTokens,
        think: request.options?.enableReasoning,
        streaming: true,
    })
}

export function createChatSession(request: ChatRequest, deps: ChatServiceDependencies): ChatSession {
    const baseModel = createBaseModel(request, deps)
    const skillDefinition = resolveSkillDefinitionForRequest(request)
    const skillSystemPrompt = skillDefinition?.systemPrompt
    const skillOutputPolicyPrompt = getSkillOutputPolicyPrompt(skillDefinition)
    const activeTools = getActiveToolDefinitions(skillDefinition)
    const activeToolNames = activeTools.map(toolDefinition => toolDefinition.name)
    const toolUseSystemPrompt = getToolUseSystemPrompt(activeToolNames)
    const toolRetrySystemPrompt = getToolRetrySystemPrompt(activeToolNames)
    const toolResultSystemPrompt = getToolResultSystemPrompt(activeToolNames)
    const toolBoundModel = activeTools.length > 0 ? baseModel.bindTools(activeTools.map(toolDefinition => toolDefinition.tool)) : null
    const langChainMessages = toLangChainMessages(request.messages)
    const directAnswerMessages: BaseMessage[] = [...buildSystemMessages(skillSystemPrompt, skillOutputPolicyPrompt), ...langChainMessages]

    return {
        request,
        baseModel,
        toolBoundModel,
        skillDefinition,
        skillSystemPrompt,
        skillOutputPolicyPrompt,
        activeTools,
        activeToolNames,
        langChainMessages,
        directAnswerMessages,
        toolUseSystemPrompt,
        toolRetrySystemPrompt,
        toolResultSystemPrompt,
    }
}
