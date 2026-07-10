import { describe, expect, it, vi } from 'vitest'

import { CHAT_MEMORY_RECENT_TURN_LIMIT, createChatMemoryService } from '@/lib/ai/runtime/chat-memory'
import { createUserMemoryService } from '@/lib/ai/runtime/user-memory'

import { createFakeBaseStore } from './fake-base-store'

const env = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-with-at-least-thirty-two-characters',
}

describe('runtime/chat-memory pinned decision promotion', () => {
    it('promotePinnedDecisionDiff 只处理新增或变化的 pinnedDecision', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, env, {
            store: store.store,
        })

        const result = await service.promotePinnedDecisionDiff({
            nextPinnedDecisions: ['保持中文输出', '解释技术问题先大白话'],
            previousPinnedDecisions: ['保持中文输出', '旧规则'],
            sessionId: 'promotion-session',
            sourceConversationId: 'conv-1',
        })

        expect(result).toEqual({
            candidates: 1,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 1,
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.95,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '以后解释技术问题怎么说？',
                sessionId: 'promotion-session',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                text: '解释技术问题先大白话',
            }),
        ])
    })

    it('没有新增或变化时跳过 promotion', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, env, {
            store: store.store,
        })

        await expect(
            service.promotePinnedDecisionDiff({
                nextPinnedDecisions: ['保持中文输出'],
                previousPinnedDecisions: ['保持中文输出'],
                sessionId: 'promotion-session',
                sourceConversationId: 'conv-1',
            })
        ).resolves.toEqual({
            reason: 'no-diff',
            status: 'skipped',
        })
    })

    it('compaction 成功后只把 pinnedDecision diff 交给 promotion，不传 summary', async () => {
        const promotePinnedDecisionDiff = vi.fn().mockResolvedValue({
            candidates: 1,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 1,
        })
        const service = createChatMemoryService({ checkpointMode: 'memory' }, env, {
            compactionGenerator: async () => ({
                pinnedDecisions: ['解释技术问题先大白话'],
                summary: '这是压缩摘要，不能直接进入长期记忆。',
            }),
            userMemoryService: {
                promotePinnedDecisionDiff,
            },
        })
        const threadId = `chat:${'a'.repeat(64)}`

        for (let index = 0; index < CHAT_MEMORY_RECENT_TURN_LIMIT + 1; index += 1) {
            await service.appendCompletedTurn(
                threadId,
                {
                    assistantText: `assistant ${index}`,
                    userText: `user ${index}`,
                },
                {
                    promotionContext: {
                        sessionId: 'promotion-session',
                        sourceConversationId: 'conv-1',
                    },
                }
            )
        }

        expect(promotePinnedDecisionDiff).toHaveBeenCalledWith({
            nextPinnedDecisions: ['解释技术问题先大白话'],
            previousPinnedDecisions: [],
            sessionId: 'promotion-session',
            sourceConversationId: 'conv-1',
        })
        expect(promotePinnedDecisionDiff).not.toHaveBeenCalledWith(
            expect.objectContaining({
                summary: expect.any(String),
            })
        )
    })

    it('compaction 失败时跳过 promotion', async () => {
        const promotePinnedDecisionDiff = vi.fn()
        const service = createChatMemoryService({ checkpointMode: 'memory' }, env, {
            compactionGenerator: async () => ({ invalid: true }),
            userMemoryService: {
                promotePinnedDecisionDiff,
            },
        })
        const threadId = `chat:${'b'.repeat(64)}`

        for (let index = 0; index < CHAT_MEMORY_RECENT_TURN_LIMIT; index += 1) {
            await service.appendCompletedTurn(threadId, {
                assistantText: `assistant ${index}`,
                userText: `user ${index}`,
            })
        }

        await service.appendCompletedTurn(
            threadId,
            {
                assistantText: 'assistant final',
                userText: 'user final',
            },
            {
                promotionContext: {
                    sessionId: 'promotion-session',
                    sourceConversationId: 'conv-1',
                },
            }
        )

        expect(promotePinnedDecisionDiff).not.toHaveBeenCalled()
    })
})
