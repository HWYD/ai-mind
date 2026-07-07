import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ZodError } from 'zod'

import { createChatModel, getModelProviderConfig, logProviderError, resolveModelSelection } from '@/lib/ai/model-provider'

import {
    type AiMindThreadState,
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT,
    CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_RECENT_MESSAGE_LIMIT,
    CHAT_MEMORY_SUMMARY_TARGET_LIMIT,
    type ChatThreadMessage,
    type CompactionOutput,
    compactionOutputSchema,
} from './state-schema'

export const CHAT_MEMORY_COMPACTION_MODEL_ID = 'deepseek/deepseek-v4-pro'

export const CHAT_MEMORY_COMPACTION_PROMPT = [
    'Return strict JSON that matches this schema: {"summary": string, "pinnedDecisions": string[]}.',
    '你是 AI Mind 的对话记忆压缩器。',
    '只根据输入的旧摘要、旧 pinned decisions、待压缩的用户可见文本消息和将被保留的 recent messages 生成结构化结果。',
    '你的输出只允许包含两个字段：summary、pinnedDecisions。',
    '不要保留 raw prompt、tool transcript、GraphState、RuntimeArtifact、workflow progress、subagent raw result、provider response 或 stack trace。',
    `summary 控制在 ${CHAT_MEMORY_SUMMARY_TARGET_LIMIT} 字以内。`,
    `pinnedDecisions 最多 ${CHAT_MEMORY_PINNED_DECISION_LIMIT} 条，每条不超过 ${CHAT_MEMORY_PINNED_DECISION_TEXT_LIMIT} 字。`,
    '不要重复 recent messages 中已经保留的局部上下文，优先压缩更早内容。',
].join('\n')

export interface ChatMemoryCompactionInput {
    messagesToCompact: ChatThreadMessage[]
    previousPinnedDecisions: string[]
    previousSummary: string
    recentMessages: ChatThreadMessage[]
}

export type ChatMemoryCompactionGenerator = (input: ChatMemoryCompactionInput) => Promise<unknown>

export interface ChatMemoryCompactionResult {
    nextPinnedDecisions: string[]
    previousPinnedDecisions: string[]
    state: AiMindThreadState
}

function logCompactionEvent(event: string, meta: Record<string, unknown>): void {
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
                '待压缩旧消息：',
                formatMessagesForPrompt(input.messagesToCompact),
                '',
                '将保留的 recent messages：',
                formatMessagesForPrompt(input.recentMessages),
            ].join('\n')
        ),
    ]
}

export async function generateStructuredCompaction(input: ChatMemoryCompactionInput): Promise<CompactionOutput> {
    const config = getModelProviderConfig()
    const resolvedModelSelection = resolveModelSelection({
        modelId: CHAT_MEMORY_COMPACTION_MODEL_ID,
        routeType: 'chat',
    })

    logCompactionEvent('model-selected', {
        modelId: resolvedModelSelection.modelId,
        provider: resolvedModelSelection.provider,
        providerModel: resolvedModelSelection.providerModel,
    })

    const modelHandle = createChatModel({
        config,
        enableReasoning: false,
        resolvedModelSelection,
        streaming: false,
        temperature: 0,
    })

    const runnable = modelHandle.model.withStructuredOutput(compactionOutputSchema, {
        name: 'ai_mind_chat_memory_compaction',
    })

    return runnable.invoke(buildCompactionMessages(input))
}

export async function compactThreadStateWithResult(
    state: AiMindThreadState,
    generator: ChatMemoryCompactionGenerator = generateStructuredCompaction
): Promise<ChatMemoryCompactionResult | null> {
    if (state.messages.length <= CHAT_MEMORY_RECENT_MESSAGE_LIMIT) {
        return {
            nextPinnedDecisions: state.pinnedDecisions,
            previousPinnedDecisions: state.pinnedDecisions,
            state,
        }
    }

    const recentMessages = state.messages.slice(-CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT)
    const messagesToCompact = state.messages.slice(0, -CHAT_MEMORY_POST_COMPACTION_RECENT_MESSAGE_LIMIT)

    logCompactionEvent('triggered', {
        messageCount: state.messages.length,
        messagesToCompactCount: messagesToCompact.length,
        pinnedDecisionCount: state.pinnedDecisions.length,
        recentMessageCount: recentMessages.length,
        summaryLength: state.summary.length,
    })

    try {
        const rawResult = await generator({
            messagesToCompact,
            previousPinnedDecisions: state.pinnedDecisions,
            previousSummary: state.summary,
            recentMessages,
        })
        const result = compactionOutputSchema.parse(rawResult)

        logCompactionEvent('succeeded', {
            pinnedDecisionCount: result.pinnedDecisions.length,
            recentMessageCount: recentMessages.length,
            summaryLength: result.summary.length,
        })

        return {
            nextPinnedDecisions: result.pinnedDecisions,
            previousPinnedDecisions: state.pinnedDecisions,
            state: {
                lastCompactedAt: new Date().toISOString(),
                messages: recentMessages,
                pinnedDecisions: result.pinnedDecisions,
                summary: result.summary,
            },
        }
    } catch (error) {
        if (error instanceof ZodError) {
            logCompactionEvent('schema-parse-failed', {
                issueCount: error.issues.length,
                issues: error.issues.map(issue => ({
                    code: issue.code,
                    path: issue.path.join('.'),
                })),
            })
        } else {
            logProviderError(error)
            logCompactionEvent('generator-failed', {
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'UnknownError',
            })
        }

        return null
    }
}

export async function compactThreadState(
    state: AiMindThreadState,
    generator: ChatMemoryCompactionGenerator = generateStructuredCompaction
): Promise<AiMindThreadState | null> {
    const result = await compactThreadStateWithResult(state, generator)

    return result?.state ?? null
}
