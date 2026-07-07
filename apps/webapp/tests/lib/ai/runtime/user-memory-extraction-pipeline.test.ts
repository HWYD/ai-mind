import { describe, expect, it, vi } from 'vitest'

import { buildUserMemoryExtractionJobInput, createUserMemoryExtractionPipeline } from '@/lib/ai/runtime/user-memory'

describe('runtime/user-memory extraction pipeline', () => {
    it('会跳过缺少 session/source conversation 或空 turn', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: vi.fn(),
            service: {
                putCandidate: vi.fn(),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: 'assistant',
                latestUserText: 'user',
                path: 'ordinary_chat',
                sessionId: '',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            reason: 'missing-session',
            status: 'skipped',
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '',
                latestUserText: 'user',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            reason: 'empty-turn',
            status: 'skipped',
        })
    })

    it('structured extractor 输出 explicit memory intent candidate 时会写入', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [
                {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    reason: '明确要求记住用户偏好',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceSignal: 'explicit_memory_intent',
                    sourceText: '记住我喜欢吃桃子。',
                    tags: ['桃子', '水果'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
            ],
            service: {
                putCandidate: vi.fn().mockResolvedValue({
                    stableKey: 'user_preference:prefer-桃子',
                    status: 'written',
                }),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '好的，我记住了。',
                latestUserText: '记住我喜欢吃桃子。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            candidates: 1,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 1,
        })
    })

    it('structured extractor 可以输出普通稳定偏好 candidate', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [
                {
                    action: 'add',
                    confidence: 0.9,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    reason: '普通稳定偏好',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceSignal: 'implicit_stable_preference',
                    sourceText: '给我推荐水果时优先考虑桃子。',
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                {
                    action: 'add',
                    confidence: 0.6,
                    identity: {
                        subject: '情绪',
                    },
                    stability: 'temporary',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '我现在很难过。',
                    tags: [],
                    text: '我现在很难过。',
                    type: 'stable_user_context',
                },
            ],
            service: {
                putCandidate: vi
                    .fn()
                    .mockResolvedValueOnce({
                        stableKey: 'user_preference:prefer-桃子',
                        status: 'written',
                    })
                    .mockResolvedValueOnce({
                        reason: 'low_confidence',
                        status: 'rejected',
                    }),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '可以考虑桃子。',
                latestUserText: '给我推荐水果时优先考虑桃子。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            candidates: 2,
            rejected: 1,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 1,
        })
    })

    it('no-memory turn 允许 extractor 返回空数组', async () => {
        const putCandidate = vi.fn()
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [],
            service: {
                putCandidate,
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: 'useEffect 用来处理副作用。',
                latestUserText: '解释一下 React useEffect。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            candidates: 0,
            rejected: 0,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 0,
        })

        expect(putCandidate).not.toHaveBeenCalled()
    })

    it('会把 extractor 的 0..N candidates 统计为写入结果', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [
                {
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
                {
                    action: 'add',
                    confidence: 0.6,
                    identity: {
                        subject: '情绪',
                    },
                    stability: 'temporary',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: '我现在很难过。',
                    tags: [],
                    text: '我现在很难过。',
                    type: 'stable_user_context',
                },
            ],
            service: {
                putCandidate: vi
                    .fn()
                    .mockResolvedValueOnce({
                        stableKey: 'user_preference:prefer-桃子',
                        status: 'written',
                    })
                    .mockResolvedValueOnce({
                        reason: 'low_confidence',
                        status: 'rejected',
                    }),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '好的，我记住了。',
                latestUserText: '记住我喜欢吃桃子。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            candidates: 2,
            rejected: 1,
            status: 'processed',
            suppressed: 0,
            updated: 0,
            written: 1,
        })
    })

    it('extractor 异常时返回 failed', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => {
                throw new Error('extractor unavailable')
            },
            service: {
                putCandidate: vi.fn(),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '好的，我记住了。',
                latestUserText: '记住我喜欢吃桃子。',
                path: 'tool_assisted_ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            reason: 'extractor-unavailable',
            status: 'failed',
        })
    })

    it('service 返回 skipped 时按 store-unavailable failed 收口', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [
                {
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
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
            ],
            service: {
                putCandidate: vi.fn().mockResolvedValue({
                    reason: 'store-unavailable',
                    status: 'skipped',
                }),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '好的，我记住了。',
                latestUserText: '记住我喜欢吃桃子。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            reason: 'store-unavailable',
            status: 'failed',
        })
    })

    it('service 抛错时按 unsafe-error failed 收口', async () => {
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor: async () => [
                {
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
                    tags: ['桃子'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
            ],
            service: {
                putCandidate: vi.fn().mockRejectedValue(new Error('unsafe store write')),
            },
        })

        await expect(
            processCompletedTurnForMemory({
                assistantFinalText: '好的，我记住了。',
                latestUserText: '记住我喜欢吃桃子。',
                path: 'ordinary_chat',
                sessionId: 'session-1',
                sourceConversationId: 'conversation-1',
            })
        ).resolves.toEqual({
            reason: 'unsafe-error',
            status: 'failed',
        })
    })

    it('会只保留 allowlisted extraction job input，不把 raw runtime 字段送给 extractor', async () => {
        const extractor = vi.fn().mockResolvedValue([])
        const processCompletedTurnForMemory = createUserMemoryExtractionPipeline({
            extractor,
            service: {
                putCandidate: vi.fn(),
            },
        })

        await processCompletedTurnForMemory({
            assistantFinalText: 'assistant',
            latestUserText: 'user',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['保留这个决定。'],
                summary: '保留这个摘要。',
                graphState: { secret: true },
                rawToolResult: 'should not pass through',
            } as never,
            sessionId: 'session-1',
            sourceConversationId: 'conversation-1',
            messages: [{ role: 'user', text: 'full transcript' }],
            rawTranscript: '[user] hello',
            rawResourceContent: 'resource body',
            runtimeArtifact: { output: 1 },
            workflowProgress: { step: 1 },
            rawPrompt: 'internal prompt',
            rawProviderResponse: { usage: 1 },
            apiKey: 'sk-secret',
            cookie: 'session=secret',
            providerConfig: { baseUrl: 'http://secret' },
        } as never)

        expect(extractor).toHaveBeenCalledWith({
            assistantFinalText: 'assistant',
            latestUserText: 'user',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['保留这个决定。'],
                summary: '保留这个摘要。',
            },
            sessionId: 'session-1',
            sourceConversationId: 'conversation-1',
        })
    })

    it('buildUserMemoryExtractionJobInput 会只保留 allowlisted safe short-term context', () => {
        const jobInput = buildUserMemoryExtractionJobInput({
            assistantFinalText: 'assistant',
            latestUserText: 'user',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['保留这个决定。'],
                summary: '保留这个摘要。',
                // @ts-expect-error test unsafe fields
                rawToolResult: 'should not pass through',
            },
            sessionId: 'session-1',
            sourceConversationId: 'conversation-1',
        })

        expect(jobInput).toEqual({
            assistantFinalText: 'assistant',
            latestUserText: 'user',
            path: 'ordinary_chat',
            safeShortTermContext: {
                pinnedDecisions: ['保留这个决定。'],
                summary: '保留这个摘要。',
            },
            sessionId: 'session-1',
            sourceConversationId: 'conversation-1',
        })
    })
})
