import { InMemoryStore } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'

import { createUserMemoryService, getUserMemoryRuntimeConfig } from '@/lib/ai/runtime/user-memory'

const TEST_ENV = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
}

describe('runtime/user-memory service', () => {
    it('missing session 返回 skipped', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.9,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: '',
            })
        ).resolves.toEqual({
            reason: 'missing-session',
            status: 'skipped',
        })
    })

    it('missing source conversation 返回 skipped', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.9,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: '',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'missing-source-conversation',
            status: 'skipped',
        })
    })

    it('draft source conversation id 返回 skipped', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.9,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: '__draft__',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'missing-source-conversation',
            status: 'skipped',
        })
    })

    it('putCandidate 会写入并允许后续检索', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子', '水果'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            stableKey: 'user_preference:prefer-桃子',
            status: 'written',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-1',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'user_preference:prefer-桃子',
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            }),
        ])
    })

    it('相同 stable key 会更新而不是重复创建', async () => {
        const store = new InMemoryStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            now: () => new Date('2026-07-06T00:00:00.000Z'),
            store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.9,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-1',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.92,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-2',
                    sourceText: '我依然喜欢桃子。',
                    tags: ['桃子', '水果'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            stableKey: 'user_preference:prefer-桃子',
            status: 'updated',
        })

        const items = await store.search(['ai-mind', 'user-memory', 'v1'], { limit: 10 })
        expect(items).toHaveLength(1)
    })

    it('完全重复的 candidate 返回 duplicate rejected', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-1',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.96,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-2',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子', '水果'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'duplicate',
            status: 'rejected',
        })
    })

    it('store error 不向上抛出', async () => {
        const failingStore = {
            delete: async () => undefined,
            get: async () => {
                throw new Error('store unavailable')
            },
            listNamespaces: async () => [],
            put: async () => undefined,
            search: async () => [],
        }
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: failingStore as unknown as InMemoryStore,
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.9,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'store-unavailable',
            status: 'skipped',
        })
    })

    it('provider 初始化失败时检索安全降级为空数组', async () => {
        const service = createUserMemoryService({ ...getUserMemoryRuntimeConfig({}, 'production'), storeMode: 'postgres' }, TEST_ENV)

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-1',
            })
        ).resolves.toEqual([])
    })

    it('会拒绝 oversized / temporary / speculative / irrelevant / unsupported / untrusted candidates', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        facet: '先大白话再专业',
                        subject: '技术解释',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: 'x',
                    tags: [],
                    text: 'a'.repeat(301),
                    type: 'communication_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'too_long',
            status: 'rejected',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: '情绪',
                    },
                    stability: 'temporary',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '我现在很难过。',
                    tags: ['情绪'],
                    text: '用户现在很难过。',
                    type: 'stable_user_context',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'temporary',
            status: 'rejected',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: 'windows',
                    },
                    stability: 'speculative',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '也许我主要使用 Windows 和 PowerShell。',
                    tags: ['windows', 'powershell'],
                    text: '用户可能主要使用 Windows 和 PowerShell。',
                    type: 'stable_user_context',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'speculative',
            status: 'rejected',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: 'general',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '记住这个。',
                    tags: [],
                    text: '记住这个。',
                    type: 'stable_user_context',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'irrelevant',
            status: 'rejected',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: '未知偏好',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: 'unknown type',
                    tags: [],
                    text: '用户有一个未知类型偏好。',
                    type: 'unknown_type',
                } as never,
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'unsupported_type',
            status: 'rejected',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    rawModelOutput: {
                        leaked: true,
                    },
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                } as never,
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            reason: 'unsafe',
            status: 'rejected',
        })
    })

    it('不会把 sourceText 或原始模型字段持久化到 UserMemory document', async () => {
        const store = new InMemoryStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                reason: '用户明确要求记住',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-1',
        })

        const items = await store.search(['ai-mind', 'user-memory', 'v1'], { limit: 10 })
        expect(items).toHaveLength(1)
        expect(items[0]?.value).toEqual(
            expect.objectContaining({
                reason: '用户明确要求记住',
                sourceConversationId: 'conversation-1',
                text: '用户喜欢吃桃子。',
            })
        )
        expect(items[0]?.value).not.toHaveProperty('sourceText')
        expect(items[0]?.value).not.toHaveProperty('rawModelOutput')
        expect(items[0]?.value).not.toHaveProperty('validationDiagnostics')
    })

    it('unsafe reason 不会持久化到 UserMemory document', async () => {
        const store = new InMemoryStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                reason: 'provider response 里有 usage 和 API key。',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-1',
        })

        const items = await store.search(['ai-mind', 'user-memory', 'v1'], { limit: 10 })
        expect(items).toHaveLength(1)
        expect(items[0]?.value).toEqual(
            expect.objectContaining({
                sourceConversationId: 'conversation-1',
                text: '用户喜欢吃桃子。',
            })
        )
        expect(items[0]?.value).not.toHaveProperty('reason')
    })

    it('suppress candidate 会持久压制旧 memory', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-1',
        })

        await expect(
            service.putCandidate({
                candidate: {
                    action: 'suppress',
                    confidence: 0.95,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-2',
                    sourceSignal: 'forget_or_negation',
                    sourceText: '我现在不太喜欢吃桃子了，以后别按这个推荐。',
                    tags: ['桃子', '水果'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                sessionId: 'session-1',
            })
        ).resolves.toEqual({
            stableKey: 'user_preference:prefer-桃子',
            status: 'suppressed',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-1',
            })
        ).resolves.toEqual([])
    })
})
