import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ContextBudget, estimateModelInputTokens } from '@/lib/ai/model-provider'
import type { AiMindThreadState, ChatThreadMessage } from '@/lib/ai/runtime/chat-memory'
import {
    buildChatMemoryContextMessages,
    CHAT_MEMORY_COMPACTION_MAX_OUTPUT_TOKENS,
    CHAT_MEMORY_PINNED_DECISION_LIMIT,
    CHAT_MEMORY_SUMMARY_TARGET_LIMIT,
    compactionOutputSchema,
    compactThreadState,
    estimateChatMemoryTokens,
} from '@/lib/ai/runtime/chat-memory'

const budget: ContextBudget = {
    compactionTriggerTokens: 320,
    effectiveWindowTokens: 1000,
    hardInputTokens: 900,
    maxOutputTokens: 100,
    operationalCapTokens: 1000,
    physicalWindowTokens: 1000,
    postCompactionTargetTokens: 180,
    runtimeReserveTokens: 100,
}

const retentionBudget: ContextBudget = {
    ...budget,
    postCompactionTargetTokens: 300,
}

function message(index: number): ChatThreadMessage {
    return {
        createdAt: new Date(index).toISOString(),
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: index === 1 ? '决定：v0.4.2 不保存 Tasklist GraphState 到 chat memory。' : `message ${index} ${'token '.repeat(80)}`,
    }
}

function state(count: number): AiMindThreadState {
    return {
        messages: Array.from({ length: count }, (_, index) => message(index)),
        pinnedDecisions: [],
        summary: '',
    }
}

describe('runtime/chat-memory compaction', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('低于 token trigger 时不压缩，即使消息数量已经超过旧的四条限制', async () => {
        const original: AiMindThreadState = {
            messages: Array.from({ length: 6 }, (_, index) => ({
                ...message(index),
                text: `short ${index}`,
            })),
            pinnedDecisions: [],
            summary: '',
        }
        const generator = vi.fn()

        await expect(compactThreadState(original, budget, generator)).resolves.toBe(original)
        expect(generator).not.toHaveBeenCalled()
    })

    it('以实际注入的 memory messages 估算 token，并用同一投影拒绝超出 target 的候选', async () => {
        const original = state(6)
        const candidate: AiMindThreadState = {
            messages: [],
            pinnedDecisions: ['必须保持实际注入模板与预算估算一致。'],
            summary: '这是压缩后的摘要。',
        }
        const actualCandidateTokens = estimateModelInputTokens(buildChatMemoryContextMessages(candidate)).estimatedTokens
        const candidateBudget: ContextBudget = {
            ...budget,
            compactionTriggerTokens: 1,
            postCompactionTargetTokens: actualCandidateTokens - 1,
        }

        expect(estimateChatMemoryTokens(candidate)).toBe(actualCandidateTokens)
        await expect(
            compactThreadState(original, candidateBudget, async () => ({
                pinnedDecisions: candidate.pinnedDecisions,
                summary: candidate.summary,
            }))
        ).resolves.toBeNull()
    })

    it('超过 token trigger 后以 summary、全部 pins 和全部 raw messages 生成候选，并只保留完整最新轮次', async () => {
        const original = {
            ...state(6),
            pinnedDecisions: ['oldest pin', 'newest pin'],
            summary: 'previous summary',
        }
        let capturedInput: unknown
        const compacted = await compactThreadState(original, budget, async input => {
            capturedInput = input
            return {
                pinnedDecisions: ['oldest generated pin', 'newest generated pin'],
                summary: '更早对话已被压缩。',
            }
        })

        expect(capturedInput).toMatchObject({
            messages: original.messages,
            previousPinnedDecisions: original.pinnedDecisions,
            previousSummary: original.summary,
        })
        expect(compacted?.messages).toHaveLength(0)
        expect(compacted?.summary).toContain('更早对话已被压缩。')
        expect(compacted?.summary.length).toBeLessThanOrEqual(CHAT_MEMORY_SUMMARY_TARGET_LIMIT)
        expect(compacted?.pinnedDecisions).toEqual(['oldest generated pin', 'newest generated pin'])
        expect(compacted?.pinnedDecisions.length).toBeLessThanOrEqual(CHAT_MEMORY_PINNED_DECISION_LIMIT)
        expect(compacted?.lastCompactedAt).toBeTruthy()
        expect(compacted?.messages.map(message => message.role)).toEqual([])
    })

    it('对超大最新轮次不切割 raw messages，而是只保留 generator summary coverage', async () => {
        const original = state(4)
        const compacted = await compactThreadState(original, budget, async () => ({
            pinnedDecisions: [],
            summary: '覆盖全部旧对话的摘要。',
        }))

        expect(compacted?.messages).toEqual([])
    })

    it('候选只从最新向前保留完整 user/assistant turns', async () => {
        const original = state(6)
        const compacted = await compactThreadState(original, retentionBudget, async () => ({
            pinnedDecisions: [],
            summary: '覆盖全部旧对话的摘要。',
        }))

        expect(compacted?.messages).toEqual(original.messages.slice(-2))
        expect(compacted?.messages.map(item => item.role)).toEqual(['user', 'assistant'])
    })

    it('超过 target 的 candidate 被拒绝，即使生成输出通过 schema', async () => {
        const compacted = await compactThreadState(state(6), budget, async () => ({
            pinnedDecisions: [],
            summary: 'token '.repeat(400),
        }))

        expect(compacted).toBeNull()
    })

    it('不比原 chat memory 更小的 candidate 被拒绝', async () => {
        const notSmallerBudget: ContextBudget = {
            ...budget,
            compactionTriggerTokens: 10,
            postCompactionTargetTokens: 1000,
        }
        const compacted = await compactThreadState(
            {
                messages: [],
                pinnedDecisions: [],
                summary: 'short summary',
            },
            notSmallerBudget,
            async () => ({
                pinnedDecisions: [],
                summary: 'token '.repeat(400),
            })
        )

        expect(compacted).toBeNull()
    })

    it('invalid model output 时返回 null，调用方可保持旧 state 不被破坏', async () => {
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const compacted = await compactThreadState(state(6), budget, async () => ({
            pinnedDecisions: [],
            // 缺少 summary，触发 schema 失败
        }))

        expect(compacted).toBeNull()
        expect(consoleInfoSpy).toHaveBeenCalledWith('[chat-memory-compaction]', expect.stringContaining('"event":"schema-parse-failed"'))
    })

    it('模型调用抛错时返回 null', async () => {
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const compacted = await compactThreadState(state(6), budget, async () => {
            throw new Error('model timeout')
        })

        expect(compacted).toBeNull()
        expect(consoleInfoSpy).toHaveBeenCalledWith('[chat-memory-compaction]', expect.stringContaining('"event":"generator-failed"'))
    })

    it('只接受 summary 与 pinnedDecisions，额外字段会被拒绝', async () => {
        const compacted = await compactThreadState(state(6), budget, async () => ({
            compactedAt: new Date().toISOString(),
            pinnedDecisions: [],
            recentMessages: [],
            summary: 'unexpected extra fields',
        }))

        expect(compacted).toBeNull()
    })

    it('compaction schema 只允许 summary 与 pinnedDecisions', () => {
        expect(
            compactionOutputSchema.parse({
                pinnedDecisions: ['必须保持边界。'],
                summary: '更早对话摘要。',
            })
        ).toEqual({
            pinnedDecisions: ['必须保持边界。'],
            summary: '更早对话摘要。',
        })

        expect(() =>
            compactionOutputSchema.parse({
                compactedAt: new Date().toISOString(),
                pinnedDecisions: [],
                summary: 'extra field',
            })
        ).toThrow()
    })

    it('将 compaction model 输出上限固定为 3000 tokens', () => {
        expect(CHAT_MEMORY_COMPACTION_MAX_OUTPUT_TOKENS).toBe(3000)
    })

    it('mixed final turns 进入 compaction 时仍保持 text-only，已截断 delivery report 会原样保留在 recent messages', async () => {
        const truncatedDeliveryReport = `# Delivery Chain Report\n\n${'D'.repeat(400)}`
        let capturedInput:
            | {
                  messages: ChatThreadMessage[]
                  previousPinnedDecisions: string[]
                  previousSummary: string
              }
            | undefined
        const mixedState: AiMindThreadState = {
            messages: [
                ...Array.from({ length: 4 }, (_, index) => message(index)),
                {
                    createdAt: '2026-07-02T10:00:00.000Z',
                    id: 'tool-user',
                    role: 'user',
                    text: '帮我执行工具',
                },
                {
                    createdAt: '2026-07-02T10:00:01.000Z',
                    id: 'tool-assistant',
                    role: 'assistant',
                    text: 'tool final answer',
                },
                {
                    createdAt: '2026-07-02T10:00:02.000Z',
                    id: 'delivery-user',
                    role: 'user',
                    text: '生成交付计划',
                },
                {
                    createdAt: '2026-07-02T10:00:03.000Z',
                    id: 'delivery-assistant',
                    role: 'assistant',
                    text: truncatedDeliveryReport,
                },
            ],
            pinnedDecisions: [],
            summary: '',
        }

        const compacted = await compactThreadState(mixedState, budget, async input => {
            capturedInput = input
            return {
                pinnedDecisions: ['必须保持 raw runtime state 不进入 chat memory。'],
                summary: '更早消息已压缩。',
            }
        })

        expect(capturedInput?.messages.map(item => item.id)).toEqual(mixedState.messages.map(item => item.id))
        expect(Object.keys(capturedInput?.messages[7] ?? {}).sort()).toEqual(['createdAt', 'id', 'role', 'text'])
        expect(
            compacted?.messages.every((item, index, items) => (index % 2 === 0 ? item.role === 'user' : item.role === 'assistant'))
        ).toBe(true)
    })
})
