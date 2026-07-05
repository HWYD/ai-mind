import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { config as loadEnv } from 'dotenv'
import { describe, expect, it } from 'vitest'

import { createChatModel, getModelProviderConfig, resolveModelSelection } from '@/lib/ai/model-provider'
import { CHAT_MEMORY_COMPACTION_PROMPT, generateStructuredCompaction } from '@/lib/ai/runtime/chat-memory/compaction'
import { type ChatThreadMessage, compactionOutputSchema } from '@/lib/ai/runtime/chat-memory/state-schema'

loadEnv({ path: '.env.local', quiet: true })
loadEnv({ path: '.env', quiet: true })

const describeLiveSmoke = process.env.AI_MIND_RUN_CHAT_MEMORY_COMPACTION_SMOKE === '1' ? describe : describe.skip
const candidateModelIds = (
    process.env.AI_MIND_CHAT_MEMORY_COMPACTION_SMOKE_MODEL_IDS ?? 'qwen/qwen3.6-flash,qwen/qwen3.7-max,deepseek/deepseek-v4-pro'
)
    .split(',')
    .map(modelId => modelId.trim())
    .filter(Boolean)

function message(index: number, role: ChatThreadMessage['role'], text: string): ChatThreadMessage {
    return {
        createdAt: new Date(index).toISOString(),
        id: `live-smoke-${index}`,
        role,
        text,
    }
}

describeLiveSmoke('runtime/chat-memory live compaction smoke', () => {
    it('当前 compaction model 可以生成 summary 和 pinned decisions', async () => {
        const result = await generateStructuredCompaction({
            messagesToCompact: [
                message(1, 'user', '决定：v0.4.2 的 chat memory 不保存 Tasklist GraphState。'),
                message(2, 'assistant', '已确认，这个边界需要作为长期约束保留。'),
                message(3, 'user', '架构边界：Delivery Chain RuntimeArtifact 只能 run-local，不能进入 chat memory。'),
                message(4, 'assistant', '收到，会把 Delivery Chain artifact 排除在普通 chat memory 外。'),
            ],
            previousPinnedDecisions: [],
            previousSummary: '',
            recentMessages: [
                message(5, 'user', '继续基于这些边界排查压缩问题。'),
                message(6, 'assistant', '我会只检查 ordinary chat memory 的压缩链路。'),
            ],
        })

        // eslint-disable-next-line no-console
        console.info(
            '[chat-memory-compaction-live-smoke]',
            JSON.stringify({
                pinnedDecisionCount: result.pinnedDecisions.length,
                summaryLength: result.summary.length,
            })
        )

        expect(result.summary.trim().length).toBeGreaterThan(0)
        expect(result.pinnedDecisions.length).toBeGreaterThan(0)
    }, 30_000)

    it.each(candidateModelIds)(
        '候选模型 %s 支持 compaction structured output',
        async modelId => {
            const resolvedModelSelection = resolveModelSelection({
                modelId,
                routeType: 'chat',
            })
            const modelHandle = createChatModel({
                config: getModelProviderConfig(),
                enableReasoning: false,
                resolvedModelSelection,
                streaming: false,
                temperature: 0,
            })
            const runnable = modelHandle.model.withStructuredOutput(compactionOutputSchema, {
                name: 'ai_mind_chat_memory_compaction_candidate',
            })
            const startedAt = Date.now()
            const result = await runnable.invoke([
                new SystemMessage(CHAT_MEMORY_COMPACTION_PROMPT),
                new HumanMessage(
                    [
                        '待压缩旧消息：',
                        '1. [user] 决定：chat memory 不保存 Tasklist GraphState。',
                        '2. [assistant] 已确认这个边界需要保留。',
                        '3. [user] 架构边界：Delivery Chain RuntimeArtifact 只能 run-local。',
                        '',
                        '将保留的 recent messages：',
                        '1. [user] 继续排查压缩模型。',
                        '2. [assistant] 我会验证 structured output 是否可用。',
                    ].join('\n')
                ),
            ])

            // eslint-disable-next-line no-console
            console.info(
                '[chat-memory-compaction-candidate-smoke]',
                JSON.stringify({
                    elapsedMs: Date.now() - startedAt,
                    modelId,
                    pinnedDecisions: result.pinnedDecisions,
                    pinnedDecisionCount: result.pinnedDecisions.length,
                    provider: resolvedModelSelection.provider,
                    providerModel: resolvedModelSelection.providerModel,
                    summary: result.summary,
                    summaryLength: result.summary.length,
                })
            )

            expect(result.summary.trim().length).toBeGreaterThan(0)
            expect(result.pinnedDecisions.length).toBeGreaterThan(0)
        },
        30_000
    )
})
