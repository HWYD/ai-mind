import { InMemoryStore } from '@langchain/langgraph'
import { describe, expect, it } from 'vitest'

import { createUserMemoryService } from '@/lib/ai/runtime/user-memory'

const TEST_ENV = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
}

describe('runtime/user-memory retrieval', () => {
    it('只检索同 session 的 active memory', async () => {
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

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'user_preference:prefer-桃子',
                text: '用户喜欢吃桃子。',
            }),
        ])
    })

    it('结构化 tags overlap 可以召回同 session 的喜欢和不喜欢偏好', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceSignal: 'explicit_memory_intent',
                sourceText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
                tags: ['桃子', '水果', '吃'],
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
                    polarity: 'avoid',
                    subject: '香菜',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceSignal: 'explicit_memory_intent',
                sourceText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
                tags: ['香菜', '蔬菜', '吃'],
                text: '用户不喜欢吃香菜。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        const memories = await service.retrieveRelevantMemories({
            latestUserText: '我喜欢吃什么？',
            sessionId: 'session-a',
        })

        expect(memories).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    stableKey: 'user_preference:prefer-桃子',
                    text: '用户喜欢吃桃子。',
                }),
                expect.objectContaining({
                    stableKey: 'user_preference:avoid-香菜',
                    text: '用户不喜欢吃香菜。',
                }),
            ])
        )
    })

    it('user_preference 通过结构化 tags overlap 召回通用长期偏好，不依赖预设 food/clothing 词表', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    polarity: 'prefer',
                    subject: 'VSCode',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceSignal: 'explicit_memory_intent',
                sourceText: '请记住我平时喜欢用 VSCode。',
                tags: ['vscode', '工具', '用'],
                text: '用户喜欢用 VSCode。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '我喜欢用什么工具？',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'user_preference:prefer-vscode',
                text: '用户喜欢用 VSCode。',
                type: 'user_preference',
            }),
        ])
    })

    it('泛化词如 推荐 不会误召回无关 user_preference', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果', '吃'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几个 VSCode 插件。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('不相关 query 可以返回空数组', async () => {
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
                sourceConversationId: 'conversation-a',
                sourceText: '记住我喜欢吃桃子。',
                tags: ['桃子', '水果'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '解释一下 React useEffect。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('技术问题不会因为泛化解释词而召回无关 project_context', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    facet: '版本规划',
                    subject: 'AI Mind',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '记住我正在持续围绕 AI Mind 做版本规划。',
                tags: ['AI Mind', '版本规划'],
                text: '用户正在持续围绕 AI Mind 做版本规划。',
                type: 'project_context',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '解释一下 React useEffect。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('技术解释问题仍可召回答案风格偏好', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
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

        const memories = await service.retrieveRelevantMemories({
            latestUserText: '解释一下 React useEffect。',
            sessionId: 'session-a',
        })

        expect(memories).toEqual([
            expect.objectContaining({
                type: 'communication_preference',
            }),
        ])
        expect(memories[0]?.text).toContain('先用大白话')
    })

    it('stable_user_context 可以通过职业背景短语召回，但不会注入无关技术问题', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
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
                sourceText: '请记住我是一名前端工程师，主要使用 Windows 和 PowerShell。',
                tags: ['前端工程师', 'windows', 'powershell'],
                text: '用户是一名前端工程师，主要使用 Windows 和 PowerShell。',
                type: 'stable_user_context',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我一个适合 Windows PowerShell 的脚本。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'stable_user_context:前端工程师',
                type: 'stable_user_context',
            }),
        ])

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '解释一下 React useEffect。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('用户询问工作背景时可以召回已保存的职业和技术栈记忆', async () => {
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: new InMemoryStore(),
        })

        await service.putCandidate({
            candidate: {
                action: 'add',
                confidence: 0.95,
                identity: {
                    facet: '五年经验 Vue React',
                    subject: '前端工程师',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceText: '请记住，我是一名有五年工作经验的前端工程师，主要使用 vue 和 react。',
                tags: ['前端工程师', 'vue', 'react'],
                text: '用户是一名有五年工作经验的前端工程师，主要使用 Vue 和 React。',
                type: 'stable_user_context',
            },
            sessionId: 'session-a',
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '你知道我的工作吗？',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([
            expect.objectContaining({
                stableKey: 'stable_user_context:前端工程师-五年经验-vue-react',
                text: '用户是一名有五年工作经验的前端工程师,主要使用 Vue 和 React。',
                type: 'stable_user_context',
            }),
        ])
    })

    it('store 读取失败时降级为空数组', async () => {
        const failingStore = {
            delete: async () => undefined,
            get: async () => null,
            listNamespaces: async () => [],
            put: async () => undefined,
            search: async () => {
                throw new Error('store unavailable')
            },
        }
        const service = createUserMemoryService(undefined, TEST_ENV, {
            store: failingStore as unknown as InMemoryStore,
        })

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })

    it('suppressed memory 不参与 retrieval', async () => {
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

        await expect(
            service.retrieveRelevantMemories({
                latestUserText: '给我推荐几种水果。',
                sessionId: 'session-a',
            })
        ).resolves.toEqual([])
    })
})
