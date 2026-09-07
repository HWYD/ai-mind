import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ZodError } from 'zod'

import { isAbortError, throwIfAborted } from '@/lib/ai/error-utils'
import {
    type ContextBudget,
    createChatModel,
    estimateModelInputTokens,
    getModelProviderConfig,
    resolveModelSelection,
} from '@/lib/ai/model-provider'

import { buildChatMemoryContextMessages } from './context-builder'
import {
    type AiMindThreadState,
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT,
    CHAT_MEMORY_SUMMARY_TARGET_LIMIT,
    type ChatThreadMessage,
    type CompactionOutput,
    compactionOutputSchema,
} from './state-schema'

export const CHAT_MEMORY_COMPACTION_MODEL_ID = 'deepseek/deepseek-v4-pro'
export const CHAT_MEMORY_COMPACTION_MAX_OUTPUT_TOKENS = 3000

export const CHAT_MEMORY_COMPACTION_PROMPT = [
    'Return strict JSON that matches this schema: {"summary": string, "pinnedDecisions": string[]}.',
    '你是 AI Mind 的对话记忆压缩器。',
    '只根据输入的旧摘要、旧 pinned decisions 和全部用户可见文本消息生成结构化结果。',
    '你的输出只允许包含两个字段：summary、pinnedDecisions。',
    '不要保留 raw prompt、tool transcript、GraphState、RuntimeArtifact、workflow progress、subagent raw result、provider response 或 stack trace。',
    `summary 控制在 ${CHAT_MEMORY_SUMMARY_TARGET_LIMIT} 字以内。`,
    `pinnedDecisions 最多 ${CHAT_MEMORY_PINNED_DECISION_LIMIT} 条，每条不超过 ${CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT} 字。`,
].join('\n')

export interface ChatMemoryCompactionInput {
    messages: ChatThreadMessage[]
    previousPinnedDecisions: string[]
    previousSummary: string
}

export interface ChatMemoryCompactionExecutionOptions {
    signal?: AbortSignal
}

export type ChatMemoryCompactionGenerator = (
    input: ChatMemoryCompactionInput,
    options?: ChatMemoryCompactionExecutionOptions
) => Promise<unknown>

export interface ChatMemoryCompactionResult {
    estimatedTokens: number
    nextPinnedDecisions: string[]
    originalTokens: number
    previousPinnedDecisions: string[]
    state: AiMindThreadState
    wasCompacted: boolean
}

export interface ChatMemoryCompactionOptions {
    force?: boolean
    signal?: AbortSignal
}

function logCompactionEvent(event: string, meta: Record<string, number | string | boolean | null>): void {
    // eslint-disable-next-line no-console
    console.info('[chat-memory-compaction]', JSON.stringify({ event, ...meta }))
}

function formatMessagesForPrompt(messages: ChatThreadMessage[]): string {
    if (messages.length === 0) {
        return '无'
    }

    return messages.map((message, index) => `${index + 1}. [${message.role}] ${message.text}`).join('\n')
}

function buildCompactionMessages(input: ChatMemoryCompactionInput) {
    return [
        new SystemMessage(CHAT_MEMORY_COMPACTION_PROMPT),
        new HumanMessage(
            [
                '旧摘要：',
                input.previousSummary.trim() || '无',
                '',
                '旧 pinned decisions：',
                input.previousPinnedDecisions.length > 0
                    ? input.previousPinnedDecisions.map((decision, index) => `${index + 1}. ${decision}`).join('\n')
                    : '无',
                '',
                '全部用户可见消息：',
                formatMessagesForPrompt(input.messages),
            ].join('\n')
        ),
    ]
}

export function estimateChatMemoryTokens(state: Pick<AiMindThreadState, 'messages' | 'pinnedDecisions' | 'summary'>): number {
    return estimateModelInputTokens(buildChatMemoryContextMessages(state)).estimatedTokens
}

function selectRetainedTurns(state: AiMindThreadState, targetTokens: number): ChatThreadMessage[] {
    const retained: ChatThreadMessage[] = []

    for (let end = state.messages.length; end >= 2; end -= 2) {
        const turn = state.messages.slice(end - 2, end)

        if (turn[0]?.role !== 'user' || turn[1]?.role !== 'assistant') {
            break
        }

        const nextMessages = [...turn, ...retained]
        const nextTokens = estimateChatMemoryTokens({
            messages: nextMessages,
            pinnedDecisions: state.pinnedDecisions,
            summary: state.summary,
        })

        if (nextTokens > targetTokens) {
            break
        }

        retained.unshift(...turn)
    }

    return retained
}

export async function generateStructuredCompaction(
    input: ChatMemoryCompactionInput,
    options: ChatMemoryCompactionExecutionOptions = {}
): Promise<CompactionOutput> {
    throwIfAborted(options.signal)
    const config = getModelProviderConfig()
    const resolvedModelSelection = resolveModelSelection({
        modelId: CHAT_MEMORY_COMPACTION_MODEL_ID,
        routeType: 'chat',
    })

    const modelHandle = createChatModel({
        config,
        enableReasoning: false,
        maxOutputTokens: CHAT_MEMORY_COMPACTION_MAX_OUTPUT_TOKENS,
        resolvedModelSelection,
        streaming: false,
        temperature: 0,
    })

    const runnable = modelHandle.model.withStructuredOutput(compactionOutputSchema, {
        name: 'ai_mind_chat_memory_compaction',
    })

    const output = await runnable.invoke(buildCompactionMessages(input), { signal: options.signal })

    throwIfAborted(options.signal)
    return output
}

export async function compactThreadStateWithResult(
    state: AiMindThreadState,
    budget: ContextBudget,
    generator: ChatMemoryCompactionGenerator = generateStructuredCompaction,
    options: ChatMemoryCompactionOptions = {}
): Promise<ChatMemoryCompactionResult | null> {
    throwIfAborted(options.signal)
    const originalTokens = estimateChatMemoryTokens(state)

    if (!options.force && originalTokens < budget.compactionTriggerTokens) {
        return {
            estimatedTokens: originalTokens,
            nextPinnedDecisions: state.pinnedDecisions,
            originalTokens,
            previousPinnedDecisions: state.pinnedDecisions,
            state,
            wasCompacted: false,
        }
    }

    logCompactionEvent('triggered', {
        originalTokens,
        pinnedDecisionCount: state.pinnedDecisions.length,
        targetTokens: budget.postCompactionTargetTokens,
    })

    try {
        const rawResult = await generator(
            {
                messages: state.messages,
                previousPinnedDecisions: state.pinnedDecisions,
                previousSummary: state.summary,
            },
            { signal: options.signal }
        )
        throwIfAborted(options.signal)
        const output = compactionOutputSchema.parse(rawResult)
        const candidateBase: AiMindThreadState = {
            messages: [],
            pinnedDecisions: output.pinnedDecisions,
            summary: output.summary,
        }
        const messages = selectRetainedTurns({ ...candidateBase, messages: state.messages }, budget.postCompactionTargetTokens)
        const estimatedTokens = estimateChatMemoryTokens({ ...candidateBase, messages })

        if (estimatedTokens > budget.postCompactionTargetTokens || estimatedTokens >= originalTokens) {
            logCompactionEvent('candidate-rejected', {
                candidateTokens: estimatedTokens,
                originalTokens,
                reason: estimatedTokens > budget.postCompactionTargetTokens ? 'over-target' : 'not-smaller',
                targetTokens: budget.postCompactionTargetTokens,
            })
            return null
        }

        const compactedState: AiMindThreadState = {
            ...candidateBase,
            lastCompactedAt: new Date().toISOString(),
            messages,
        }

        logCompactionEvent('succeeded', {
            candidateTokens: estimatedTokens,
            originalTokens,
            pinnedDecisionCount: output.pinnedDecisions.length,
            retainedMessageCount: messages.length,
        })

        return {
            estimatedTokens,
            nextPinnedDecisions: output.pinnedDecisions,
            originalTokens,
            previousPinnedDecisions: state.pinnedDecisions,
            state: compactedState,
            wasCompacted: true,
        }
    } catch (error) {
        if (options.signal?.aborted) {
            throwIfAborted(options.signal)
        }

        if (isAbortError(error)) {
            throw error
        }

        if (error instanceof ZodError) {
            logCompactionEvent('schema-parse-failed', {
                issueCount: error.issues.length,
            })
        } else {
            logCompactionEvent('generator-failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
            })
        }

        return null
    }
}

export async function compactThreadState(
    state: AiMindThreadState,
    budget: ContextBudget,
    generator: ChatMemoryCompactionGenerator = generateStructuredCompaction,
    options: ChatMemoryCompactionOptions = {}
): Promise<AiMindThreadState | null> {
    const result = await compactThreadStateWithResult(state, budget, generator, options)

    return result?.state ?? null
}
