import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    buildUserMemoryNamespace,
    createUserMemoryService,
    getUserMemoryRuntimeConfig,
    normalizeUserMemorySemanticQuery,
    retrieveRelevantUserMemories,
} from '@/lib/ai/runtime/user-memory'

import { createFakeBaseStore } from './fake-base-store'

const TEST_ENV = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
}

describe('runtime/user-memory retrieval', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('只检索同 session 的 active memory，并使用 vector search mode', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })
        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '香蕉',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-b',
                sourceText: '记住我喜欢吃香蕉。',
                tags: ['香蕉', '水果'],
                text: '用户喜欢吃香蕉。',
                type: 'user_preference',
            },
            sessionId: 'session-b',
        })

        store.setSearchHandler(({ items, namespace, options }) => {
            expect(namespace).toEqual(buildUserMemoryNamespace('session-a', TEST_ENV))
            expect(options.mode).toBe('vector')
            expect(options.query).toBe('给我推荐几种水果。')
            expect(items).toHaveLength(1)

            return items.map(item => ({
                ...item,
                score: 0.91,
            }))
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'user_preference:prefer-桃子',
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            }),
        ])
    })

    it('技术解释问题可以语义召回答案风格偏好', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    facet: '先大白话再专业',
                    subject: '技术解释',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '以后解释技术问题时，先用大白话，再补充专业说法。',
                tags: ['解释', '大白话', '技术'],
                text: '用户喜欢技术解释先用大白话，再补充专业说法。',
                type: 'communication_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items, options }) => {
            expect(options.query).toBe('LangGraph Store 是什么?别讲太抽象。')

            return items.map(item => ({
                ...item,
                score: 0.93,
            }))
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: 'LangGraph Store 是什么？别讲太抽象。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'communication_preference:技术解释-先大白话再专业',
                text: expect.stringContaining('先用大白话'),
                type: 'communication_preference',
            }),
        ])
    })

    it('饮食偏好可以通过语义检索召回', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'avoid',
                    subject: '香菜',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '请记住我不吃香菜。',
                tags: ['香菜', '饮食', '忌口'],
                text: '用户不吃香菜。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.9,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '今天适合吃什么清淡点？',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'user_preference:avoid-香菜',
                text: '用户不吃香菜。',
                type: 'user_preference',
            }),
        ])
    })

    it('不相关问题不召回长期记忆', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'avoid',
                    subject: '香菜',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '请记住我不吃香菜。',
                tags: ['香菜', '饮食', '忌口'],
                text: '用户不吃香菜。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(() => [])

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '解释一下 React useEffect。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('低于 semantic score threshold 的结果不会注入', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    facet: '先大白话再专业',
                    subject: '技术解释',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '以后解释技术问题时，先用大白话，再补充专业说法。',
                tags: ['解释', '大白话', '技术'],
                text: '用户喜欢技术解释先用大白话，再补充专业说法。',
                type: 'communication_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.31,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: 'LangGraph Store 是什么？别讲太抽象。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('suppressed memory 不参与语义召回', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })
        await service.putCandidate({
            candidate: {
                action: 'suppress',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-b',
                sourceSignal: 'forget_or_negation',
                sourceText: '我现在不太喜欢吃桃子了，以后别按这个推荐。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.94,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('当前输入与旧 memory 冲突时不注入', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'avoid',
                    subject: '香菜',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '请记住我不吃香菜。',
                tags: ['香菜', '饮食', '忌口'],
                text: '用户不吃香菜。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.95,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '我今天想吃点香菜，适合做什么？',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('旧 UserMemory 没有 semantic metadata 时不会参与 vector retrieval', async () => {
        const store = createFakeBaseStore()
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: store.store,
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    subject: '前端工程师',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '请记住我是一名前端工程师。',
                tags: ['前端工程师', '工作'],
                text: '用户是一名前端工程师。',
                type: 'stable_user_context',
            },
            sessionId: 'session-a',
        })

        const namespace = buildUserMemoryNamespace('session-a', TEST_ENV)
        const storedItem = store.getItem(namespace, 'stable_user_context:前端工程师')
        const storedDocument = storedItem?.value as Record<string, unknown> | undefined

        await store.store.put(namespace, 'stable_user_context:前端工程师', {
            ...storedDocument,
            semantic: undefined,
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.92,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '你知道我的工作吗？',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('旧 semantic provider kind 或 index version 不匹配时不会参与 vector retrieval', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '请记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        const namespace = buildUserMemoryNamespace('session-a', TEST_ENV)
        const storedItem = store.getItem(namespace, 'user_preference:prefer-桃子')
        const storedDocument = storedItem?.value as Record<string, unknown> | undefined
        const semantic = storedDocument?.semantic as Record<string, unknown> | undefined

        await store.store.put(namespace, 'user_preference:prefer-桃子', {
            ...storedDocument,
            semantic: {
                ...semantic,
                embeddingProviderKind: 'volcengine-ark-openai',
                semanticIndexVersion: 'user-memory-semantic.v1',
            },
        })

        store.setSearchHandler(({ items }) =>
            items.map(item => ({
                ...item,
                score: 0.95,
            }))
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('缺失 score 或 score 为 NaN 时不会注入结果', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        store.setSearchHandler(({ items }) =>
            items.flatMap(item => [
                { ...item },
                {
                    ...item,
                    key: `${item.key}:nan`,
                    score: Number.NaN,
                },
            ])
        )

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('query 只做标准化与裁剪，不做额外 rewrite', async () => {
        const config = getUserMemoryRuntimeConfig(TEST_ENV)
        const shortQuery = normalizeUserMemorySemanticQuery('  LangGraph   Store 是什么？ \n 别讲太抽象。  ', config)

        expect(shortQuery).toBe('LangGraph Store 是什么? 别讲太抽象。')

        const longQuery =
            '前言' +
            '甲'.repeat(config.semanticQueryHeadChars + 40) +
            '中段' +
            '乙'.repeat(120) +
            '结尾' +
            '丙'.repeat(config.semanticQueryTailChars + 40)
        const normalizedLongQuery = normalizeUserMemorySemanticQuery(longQuery, config)

        expect(normalizedLongQuery).toHaveLength(config.semanticQueryMaxChars)
        expect(normalizedLongQuery.startsWith(longQuery.slice(0, config.semanticQueryHeadChars))).toBe(true)
        expect(normalizedLongQuery.endsWith(longQuery.slice(-config.semanticQueryTailChars))).toBe(true)

        const store = createFakeBaseStore()
        let capturedQuery = ''
        store.setSearchHandler(({ options }) => {
            capturedQuery = options.query ?? ''
            return []
        })

        await expect(
            retrieveRelevantUserMemories(
                store.store,
                {
                    latestUserText: longQuery,
                    limit: 3,
                    path: 'ordinary_chat',
                    sessionId: 'session-a',
                    timeoutMs: 20,
                },
                TEST_ENV,
                config
            )
        ).resolves.toEqual([])

        expect(capturedQuery).toBe(normalizedLongQuery)
    })

    it('semantic search timeout 时安全降级为空数组，并记录脱敏日志', async () => {
        const store = createFakeBaseStore()
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        store.setSearchHandler(
            async () =>
                await new Promise(resolve => {
                    setTimeout(() => resolve([]), 30)
                })
        )

        await expect(
            retrieveRelevantUserMemories(
                store.store,
                {
                    latestUserText: '今天适合吃什么清淡点？',
                    limit: 3,
                    path: 'ordinary_chat',
                    sessionId: 'session-a',
                    timeoutMs: 5,
                },
                TEST_ENV
            )
        ).resolves.toEqual([])

        expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
        const [prefix, payload] = consoleInfoSpy.mock.calls[0] ?? []
        expect(prefix).toBe('[user-memory-retrieval]')
        expect(String(payload)).toContain('"degradationKind":"timeout"')
        expect(String(payload)).toContain('"searchMode":"vector"')
        expect(String(payload)).not.toContain('今天适合吃什么清淡点')
    })

    it('semantic search failure 时安全降级为空数组，并记录脱敏日志', async () => {
        const store = createFakeBaseStore()
        const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        store.setSearchHandler(() => {
            throw new Error('connect ECONNREFUSED postgres://user:secret@example.com/db')
        })

        await expect(
            retrieveRelevantUserMemories(
                store.store,
                {
                    latestUserText: '给我推荐几种水果。',
                    limit: 3,
                    path: 'ordinary_chat',
                    sessionId: 'session-a',
                    timeoutMs: 20,
                },
                TEST_ENV
            )
        ).resolves.toEqual([])

        expect(consoleInfoSpy).toHaveBeenCalledTimes(1)
        const [prefix, payload] = consoleInfoSpy.mock.calls[0] ?? []
        expect(prefix).toBe('[user-memory-retrieval]')
        expect(String(payload)).toContain('"degradationKind":"failure"')
        expect(String(payload)).toContain('"errorName":"Error"')
        expect(String(payload)).not.toContain('postgres://user:secret@example.com/db')
        expect(String(payload)).not.toContain('给我推荐几种水果')
    })
})
