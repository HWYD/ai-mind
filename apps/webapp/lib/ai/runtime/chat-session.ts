import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'

import { resolveGeneralToolBinding } from '@/lib/ai/capabilities'
import { toLangChainMessages } from '@/lib/ai/langchain-message-adapter'
import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'
import {
    getActionSystemPrompt,
    getAnswerSystemPrompt,
    getCoreResponseSystemPrompt,
    getToolResultSystemPrompt,
    getToolUseSystemPrompt,
} from '@/lib/ai/prompts/tool-calling'
import type { SkillDefinition } from '@/lib/ai/skills'
import { resolveSkillDefinitionForRequest } from '@/lib/ai/skills/router'
import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ChatSession } from './types'

export function buildSystemMessages(...prompts: Array<string | undefined>): BaseMessage[] {
    return prompts
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
        .map(prompt => new SystemMessage(prompt))
}

export function withChatMemoryContextMessages(messages: BaseMessage[], memoryContextMessages: BaseMessage[]): BaseMessage[] {
    if (memoryContextMessages.length === 0) {
        return messages
    }

    const firstNonSystemIndex = messages.findIndex(message => message._getType() !== 'system')

    if (firstNonSystemIndex === -1) {
        return [...messages, ...memoryContextMessages]
    }

    return [...messages.slice(0, firstNonSystemIndex), ...memoryContextMessages, ...messages.slice(firstNonSystemIndex)]
}

function getSkillOutputPolicyPrompt(skillDefinition?: SkillDefinition) {
    if (!skillDefinition?.outputPolicy) {
        return undefined
    }

    switch (skillDefinition.outputPolicy) {
        case 'concise-utility':
            return '请优先给出直接可用的结果和适中的必要解释。用户明确要求步骤、详细推导、表格或特定格式时，按要求展开。'
        case 'context-reader':
            return '请优先基于已提供资料先给结论和关键依据。用户要求深入总结、比较、步骤或表格时，按要求展开；不要假装读取未提供的资料。'
    }
}

function getLatestUserMessageOnly(request: ChatRequest): ChatRequest['messages'] {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
        const message = request.messages[index]

        if (message.role === 'user') {
            return [message]
        }
    }

    return request.messages
}

export async function createChatSession(request: ChatRequest, resolvedModelSelection: ResolvedModelSelection): Promise<ChatSession> {
    const config = getModelProviderConfig()
    const modelHandle = createChatModel({
        config,
        enableReasoning: request.options?.enableReasoning,
        maxOutputTokens: request.options?.maxTokens,
        maxRetries: 0,
        resolvedModelSelection,
        temperature: request.options?.temperature,
    })

    const { model: baseModel } = modelHandle
    const skillDefinition = resolveSkillDefinitionForRequest(request)
    const skillSystemPrompt = skillDefinition?.systemPrompt
    const skillOutputPolicyPrompt = getSkillOutputPolicyPrompt(skillDefinition)
    const toolBinding = await resolveGeneralToolBinding()
    const { activeToolCapabilityIds, activeToolDefinitionMap, activeToolNames, activeTools } = toolBinding
    const toolUseSystemPrompt = getToolUseSystemPrompt(activeToolNames)
    const toolResultSystemPrompt = getToolResultSystemPrompt(activeToolNames)
    const actionSystemPrompts = [
        getCoreResponseSystemPrompt(),
        getActionSystemPrompt(),
        skillSystemPrompt,
        skillOutputPolicyPrompt,
        toolUseSystemPrompt,
        toolResultSystemPrompt,
    ].filter((prompt): prompt is string => Boolean(prompt))
    const answerSystemPrompts = [getCoreResponseSystemPrompt(), skillOutputPolicyPrompt, getAnswerSystemPrompt()].filter(
        (prompt): prompt is string => Boolean(prompt)
    )
    const langChainMessages = toLangChainMessages(getLatestUserMessageOnly(request))

    return {
        request,
        baseModel,
        createPhaseModel: options =>
            createChatModel({
                config,
                enableReasoning: request.options?.enableReasoning,
                maxOutputTokens: request.options?.maxTokens,
                maxRetries: options.maxRetries,
                resolvedModelSelection,
                streaming: true,
                temperature: request.options?.temperature,
                timeoutMs: options.timeoutMs,
            }).model,
        modelHandle,
        skillDefinition,
        skillSystemPrompt,
        skillOutputPolicyPrompt,
        activeTools,
        activeToolCapabilityIds,
        activeToolDefinitionMap,
        activeToolNames,
        actionSystemPrompts,
        answerSystemPrompts,
        langChainMessages,
        toolUseSystemPrompt,
        toolResultSystemPrompt,
    }
}
