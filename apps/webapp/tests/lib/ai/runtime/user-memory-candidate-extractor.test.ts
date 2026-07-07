import { beforeEach, describe, expect, it, vi } from 'vitest'

const modelProviderMocks = vi.hoisted(() => ({
    createChatModel: vi.fn(),
    getModelProviderConfig: vi.fn(() => ({ providerConfig: true })),
    invoke: vi.fn(),
    logProviderError: vi.fn(),
    resolveModelSelection: vi.fn(() => ({
        catalogItem: {
            capabilities: {
                chat: true,
                embedding: false,
                jsonOutput: true,
                streaming: true,
                tasklist: true,
                toolCalling: true,
            },
            enabled: true,
            id: 'deepseek/deepseek-v4-pro',
            provider: 'qwen',
            providerModel: 'deepseek-v4-pro',
        },
        modelId: 'deepseek/deepseek-v4-pro',
        provider: 'qwen',
        providerModel: 'deepseek-v4-pro',
        routeType: 'chat',
    })),
    withStructuredOutput: vi.fn(),
}))

vi.mock('@/lib/ai/model-provider', () => ({
    createChatModel: modelProviderMocks.createChatModel,
    getModelProviderConfig: modelProviderMocks.getModelProviderConfig,
    logProviderError: modelProviderMocks.logProviderError,
    resolveModelSelection: modelProviderMocks.resolveModelSelection,
}))

import { extractUserMemoryCandidates, USER_MEMORY_EXTRACTION_MODEL_ID, USER_MEMORY_EXTRACTION_PROMPT } from '@/lib/ai/runtime/user-memory'

describe('runtime/user-memory candidate extractor', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        modelProviderMocks.invoke.mockResolvedValue({
            candidates: [
                {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        polarity: 'prefer',
                        subject: '桃子',
                    },
                    stability: 'stable',
                    reason: '用户明确要求记住用户偏好',
                    sourceSignal: 'explicit_memory_intent',
                    tags: ['桃子', '水果', '吃'],
                    text: '用户喜欢吃桃子。',
                    type: 'user_preference',
                },
                {
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        polarity: 'avoid',
                        subject: '香菜',
                    },
                    stability: 'stable',
                    reason: '用户明确要求记住用户偏好',
                    sourceSignal: 'explicit_memory_intent',
                    tags: ['香菜', '蔬菜', '吃'],
                    text: '用户不喜欢吃香菜。',
                    type: 'user_preference',
                },
            ],
        })
        modelProviderMocks.withStructuredOutput.mockReturnValue({
            invoke: modelProviderMocks.invoke,
        })
        modelProviderMocks.createChatModel.mockReturnValue({
            model: {
                withStructuredOutput: modelProviderMocks.withStructuredOutput,
            },
        })
    })

    it('固定使用 deepseek-v4-pro 结构化输出且关闭思考模式', async () => {
        const candidates = await extractUserMemoryCandidates({
            assistantFinalText: '好的，我记住了。',
            latestUserText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
            path: 'ordinary_chat',
            sessionId: 'session-1',
            sourceConversationId: 'conversation-a',
        })

        expect(modelProviderMocks.resolveModelSelection).toHaveBeenCalledWith({
            modelId: USER_MEMORY_EXTRACTION_MODEL_ID,
            routeType: 'chat',
        })
        expect(modelProviderMocks.createChatModel).toHaveBeenCalledWith(
            expect.objectContaining({
                enableReasoning: false,
                streaming: false,
                temperature: 0,
            })
        )
        expect(modelProviderMocks.withStructuredOutput).toHaveBeenCalledWith(expect.anything(), {
            name: 'ai_mind_user_memory_extractor',
        })
        expect(candidates).toEqual([
            expect.objectContaining({
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceSignal: 'explicit_memory_intent',
                sourceText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
                identity: {
                    polarity: 'prefer',
                    subject: '桃子',
                },
                stability: 'stable',
                tags: ['桃子', '水果', '吃'],
                text: '用户喜欢吃桃子。',
                type: 'user_preference',
            }),
            expect.objectContaining({
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-a',
                sourceSignal: 'explicit_memory_intent',
                sourceText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
                identity: {
                    polarity: 'avoid',
                    subject: '香菜',
                },
                stability: 'stable',
                tags: ['香菜', '蔬菜', '吃'],
                text: '用户不喜欢吃香菜。',
                type: 'user_preference',
            }),
        ])
    })

    it('prompt 明确约束事实源优先级、结构化 identity 和通用长期协作场景', async () => {
        await extractUserMemoryCandidates({
            assistantFinalText: '好的，我记住了。',
            latestUserText: '请记住我喜欢吃桃子，不喜欢吃香菜。',
            path: 'ordinary_chat',
            sessionId: 'session-1',
            sourceConversationId: 'conversation-a',
        })

        const messages = modelProviderMocks.invoke.mock.calls[0]?.[0] as Array<{ content: unknown }>

        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('服务于通用长期协作聊天场景，不局限于 AI Mind 项目本身')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain(
            '事实来源优先级：latest user text > safe pinned decisions / safe summary > assistant final text'
        )
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('不得单独生成新 memory')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('同一句话里出现多个独立长期事实时，拆成多条 candidate')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('Candidate.tags 是检索锚点，不是摘要')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('stable_user_context 的职业/背景/技术栈信息可输出 3-6 个 tags')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('工作 / 职业 / 经验 / 技术栈 / 前端工程师 / Vue / React')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('Candidate.identity 是 stable key v2 的结构化 identity')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('如果内容不是 stable memory，就不要输出 candidate')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('communication_preference')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('workflow_preference')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('recurring_constraint')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('project_context')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('risk_preference')
        expect(USER_MEMORY_EXTRACTION_PROMPT).toContain('只有当你能明确写出被 suppress 的旧 memory identity 时才输出 suppress')
        expect(String(messages[0]?.content)).toContain('示例输入：请记住我喜欢吃桃子，不喜欢吃香菜。')
        expect(String(messages[0]?.content)).toContain('"identity":{"subject":"桃子","polarity":"prefer"}')
        expect(String(messages[0]?.content)).toContain('"type":"communication_preference"')
        expect(String(messages[0]?.content)).toContain('"type":"workflow_preference"')
        expect(String(messages[0]?.content)).toContain('"type":"recurring_constraint"')
        expect(String(messages[0]?.content)).toContain('"type":"project_context"')
        expect(String(messages[0]?.content)).toContain('"type":"risk_preference"')
        expect(String(messages[0]?.content)).toContain('五年工作经验的前端工程师')
        expect(String(messages[0]?.content)).toContain('"action":"suppress"')
        expect(String(messages[1]?.content)).toContain('latest user text:')
        expect(String(messages[1]?.content)).toContain('请记住我喜欢吃桃子，不喜欢吃香菜。')
    })
})
