import { describe, expect, it } from 'vitest'

import { createUserMemoryService, getUserMemoryRuntimeConfig, USER_MEMORY_NAMESPACE_PREFIX } from '@/lib/ai/runtime/user-memory'

import { createFakeBaseStore, type FakeBaseStoreController } from './fake-base-store'

const TEST_ENV = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
}

function getStoredItems(store: FakeBaseStoreController) {
    return store.getItems([...USER_MEMORY_NAMESPACE_PREFIX])
}

describe('runtime/user-memory service', () => {
    it('missing session 返回 skipped', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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

    it('putCandidate 会写入 active UserMemory document，并可通过显式 scored search 检索', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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

        const [storedItem] = getStoredItems(store)
        expect(storedItem?.value).toEqual(
            expect.objectContaining({
                semantic: expect.objectContaining({
                    embeddingModelId: 'doubao-embedding-vision',
                    embeddingProviderKind: 'volcengine-ark-doubao-openai-compatible',
                    semanticIndexFields: ['text', 'tags'],
                    semanticIndexVersion: 'user-memory-semantic.v3',
                }),
                stableKey: 'user_preference:prefer-桃子',
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            })
        )

        store.setSearchHandler(({ items }) => items.map(item => ({ ...item, score: 0.92 })))

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
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            now: () => new Date('2026-07-06T00:00:00.000Z'),
            store: store.store,
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

        expect(getStoredItems(store)).toHaveLength(1)
    })

    it('完全重复的 candidate 返回 duplicate rejected', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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
            store: failingStore as never,
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
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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

        const [item] = getStoredItems(store)
        expect(item?.value).toEqual(
            expect.objectContaining({
                reason: '用户明确要求记住',
                sourceConversationId: 'conversation-1',
                text: '用户喜欢吃桃子。',
            })
        )
        expect(item?.value).not.toHaveProperty('sourceText')
        expect(item?.value).not.toHaveProperty('rawModelOutput')
        expect(item?.value).not.toHaveProperty('validationDiagnostics')
    })

    it('unsafe reason 不会持久化到 UserMemory document', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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

        const [item] = getStoredItems(store)
        expect(item?.value).toEqual(
            expect.objectContaining({
                sourceConversationId: 'conversation-1',
                text: '用户喜欢吃桃子。',
            })
        )
        expect(item?.value).not.toHaveProperty('reason')
    })

    it('suppress candidate 会持久压制旧 memory，并在 scored retrieval 中被过滤', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
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

        store.setSearchHandler(({ items }) => items.map(item => ({ ...item, score: 0.93 })))

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-1',
            })
        ).resolves.toEqual([])
    })
})
