import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'

import { resolveToolBindingForSkill } from '@/lib/ai/capabilities'
import { toLangChainMessages } from '@/lib/ai/langchain-message-adapter'
import type { ResolvedModelSelection } from '@/lib/ai/model-provider'
import { createChatModel, getModelProviderConfig } from '@/lib/ai/model-provider'
import { getToolResultSystemPrompt, getToolRetrySystemPrompt, getToolUseSystemPrompt } from '@/lib/ai/prompts/tool-calling'
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
            return '请优先输出简洁、结果优先、偏实用的回答；能先给结论就先给结论，不要展开冗长过程。'
        case 'context-reader':
            return '请优先基于外部上下文先给结论，再用一到两句话补充必要来源或依据；不要展开冗长叙述，也不要假装读取了工具未返回的信息。'
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
        resolvedModelSelection,
        temperature: request.options?.temperature,
    })

    const { model: baseModel } = modelHandle
    const skillDefinition = resolveSkillDefinitionForRequest(request)
    const skillSystemPrompt = skillDefinition?.systemPrompt
    const skillOutputPolicyPrompt = getSkillOutputPolicyPrompt(skillDefinition)
    const toolBinding = await resolveToolBindingForSkill(skillDefinition)
    const { activeToolCapabilityIds, activeToolDefinitionMap, activeToolNames, activeTools } = toolBinding
    const toolUseSystemPrompt = getToolUseSystemPrompt(activeToolNames)
    const toolRetrySystemPrompt = getToolRetrySystemPrompt(activeToolNames)
    const toolResultSystemPrompt = getToolResultSystemPrompt(activeToolNames)
    const toolBoundModel =
        activeTools.length > 0 && modelHandle.bindTools
            ? modelHandle.bindTools(activeTools.map(toolDefinition => toolDefinition.tool))
            : null
    const langChainMessages = toLangChainMessages(getLatestUserMessageOnly(request))
    const directAnswerMessages: BaseMessage[] = [...buildSystemMessages(skillSystemPrompt, skillOutputPolicyPrompt), ...langChainMessages]

    return {
        request,
        baseModel,
        modelHandle,
        toolBoundModel,
        skillDefinition,
        skillSystemPrompt,
        skillOutputPolicyPrompt,
        activeTools,
        activeToolCapabilityIds,
        activeToolDefinitionMap,
        activeToolNames,
        langChainMessages,
        directAnswerMessages,
        toolUseSystemPrompt,
        toolRetrySystemPrompt,
        toolResultSystemPrompt,
    }
}
