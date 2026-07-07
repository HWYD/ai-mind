import { describe, expect, it } from 'vitest'

import {
    buildUserMemoryNamespace,
    buildUserMemoryStableKey,
    normalizeUserMemoryTag,
    normalizeUserMemoryTags,
    userMemoryCandidateSchema,
    userMemoryTypeSchema,
    validateUserMemoryCandidate,
} from '@/lib/ai/runtime/user-memory'

const TEST_ENV = {
    AI_MIND_AGENT_RUN_SESSION_SECRET: 'test-secret-test-secret-test-secret-1234',
}

describe('runtime/user-memory validation', () => {
    it('允许白名单 memory type', () => {
        expect(userMemoryTypeSchema.safeParse('user_preference').success).toBe(true)
        expect(userMemoryTypeSchema.safeParse('stable_user_context').success).toBe(true)
        expect(userMemoryTypeSchema.safeParse('workflow_preference').success).toBe(true)
        expect(userMemoryTypeSchema.safeParse('unknown_type').success).toBe(false)
    })

    it('candidate schema 要求 sourceConversationId', () => {
        expect(
            userMemoryCandidateSchema.safeParse({
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
            }).success
        ).toBe(false)
    })

    it('confidence 低于阈值时拒绝', () => {
        const result = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.6,
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
        })

        expect(result).toEqual({
            reason: 'low_confidence',
            status: 'rejected',
        })
    })

    it('文本超长时拒绝', () => {
        const result = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.9,
            identity: {
                facet: '先大白话再专业',
                subject: '技术解释',
            },
            stability: 'stable',
            source: 'eligible_completed_turn',
            sourceConversationId: 'conversation-1',
            sourceText: 'x',
            tags: ['x'],
            text: 'a'.repeat(301),
            type: 'communication_preference',
        })

        expect(result).toEqual({
            reason: 'too_long',
            status: 'rejected',
        })
    })

    it('允许非敏感 stable_user_context 通过 validation', () => {
        const result = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.95,
            identity: {
                subject: '前端工程师',
            },
            stability: 'stable',
            source: 'eligible_completed_turn',
            sourceConversationId: 'conversation-1',
            sourceText: '请记住我是一名前端工程师，主要使用 Windows 和 PowerShell。',
            tags: ['前端工程师', 'windows', 'powershell'],
            text: '用户是一名前端工程师，主要使用 Windows 和 PowerShell。',
            type: 'stable_user_context',
        })

        expect(result).toEqual({
            candidate: expect.objectContaining({
                stableKey: 'stable_user_context:前端工程师',
                tags: ['前端工程师', 'windows', 'powershell'],
                text: '用户是一名前端工程师,主要使用 Windows 和 PowerShell。',
                type: 'stable_user_context',
            }),
            status: 'accepted',
        })
    })

    it('允许非饮食 user_preference 通过 validation', () => {
        const result = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.95,
            identity: {
                polarity: 'prefer',
                subject: '卫衣',
            },
            stability: 'stable',
            source: 'eligible_completed_turn',
            sourceConversationId: 'conversation-1',
            sourceText: '请记住我平时喜欢穿卫衣。',
            tags: ['卫衣', '穿搭'],
            text: '用户喜欢穿卫衣。',
            type: 'user_preference',
        })

        expect(result).toEqual({
            candidate: expect.objectContaining({
                stableKey: 'user_preference:prefer-卫衣',
                tags: ['卫衣', '穿搭'],
                text: '用户喜欢穿卫衣。',
                type: 'user_preference',
            }),
            status: 'accepted',
        })
    })

    it('标签会被规范化和去重', () => {
        expect(normalizeUserMemoryTag(' Codex Prompt ')).toBe('codex-prompt')
        expect(normalizeUserMemoryTags([' Codex Prompt ', 'codex prompt', '中文'])).toEqual(['codex-prompt', '中文'])
    })

    it('会拒绝敏感信息和 raw runtime 内容', () => {
        const sensitive = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.9,
            identity: {
                subject: '长期信息',
            },
            stability: 'stable',
            source: 'eligible_completed_turn',
            sourceConversationId: 'conversation-1',
            sourceText: '这是我的身份证号。',
            tags: [],
            text: '这是我的身份证号。',
            type: 'stable_user_context',
        })
        const rawRuntime = validateUserMemoryCandidate({
            action: 'add',
            confidence: 0.9,
            identity: {
                subject: '项目配置',
            },
            stability: 'stable',
            source: 'eligible_completed_turn',
            sourceConversationId: 'conversation-1',
            sourceText: '请保存 provider config',
            tags: [],
            text: '保存 provider config。',
            type: 'project_context',
        })

        expect(sensitive).toEqual({
            reason: 'sensitive_personal_information',
            status: 'rejected',
        })
        expect(rawRuntime).toEqual({
            reason: 'raw_runtime_state',
            status: 'rejected',
        })
    })

    it('deterministic validation 由 structured stability 决定，不靠 speculative 词面硬拒绝', () => {
        expect(
            validateUserMemoryCandidate({
                action: 'add',
                confidence: 0.95,
                identity: {
                    subject: 'windows',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '也许我主要使用 Windows 和 PowerShell。',
                tags: ['windows', 'powershell'],
                text: '用户可能主要使用 Windows 和 PowerShell。',
                type: 'stable_user_context',
            })
        ).toEqual({
            candidate: expect.objectContaining({
                stableKey: 'stable_user_context:windows',
                tags: ['windows', 'powershell'],
                text: '用户可能主要使用 Windows 和 PowerShell。',
                type: 'stable_user_context',
            }),
            status: 'accepted',
        })
    })

    it('structured stability 为 temporary 时拒绝', () => {
        expect(
            validateUserMemoryCandidate({
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
            })
        ).toEqual({
            reason: 'temporary',
            status: 'rejected',
        })
    })

    it('structured stability 为 speculative 时拒绝', () => {
        expect(
            validateUserMemoryCandidate({
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
            })
        ).toEqual({
            reason: 'speculative',
            status: 'rejected',
        })
    })

    it('拒绝 sensitive personal information / API key / cookie / provider config / raw prompt', () => {
        const samples = [
            { expected: 'sensitive_personal_information', text: 'Please remember my social security number.' },
            { expected: 'sensitive_personal_information', text: '这是我的住址，请长期记住。' },
            { expected: 'raw_runtime_state', text: '我的 API key 是 sk-super-secret-value。' },
            { expected: 'raw_runtime_state', text: '请保存这个 cookie。' },
            { expected: 'raw_runtime_state', text: '请记住 provider config。' },
            { expected: 'raw_runtime_state', text: '请保存 raw prompt。' },
        ] as const

        for (const sample of samples) {
            expect(
                validateUserMemoryCandidate({
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: '长期信息',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: sample.text,
                    tags: [],
                    text: sample.text,
                    type: 'stable_user_context',
                })
            ).toEqual({
                reason: sample.expected,
                status: 'rejected',
            })
        }
    })

    it('拒绝 full transcript / raw tool-resource-provider runtime / stack trace', () => {
        const samples = [
            { expected: 'full_transcript', text: '[user] 你好\n[assistant] 你好' },
            { expected: 'full_transcript', text: 'user: hello\nassistant: hi' },
            { expected: 'raw_runtime_state', text: '请保存 raw tool result。' },
            { expected: 'raw_runtime_state', text: '这是 raw resource content。' },
            { expected: 'raw_runtime_state', text: '这是 MCP raw envelope。' },
            { expected: 'raw_runtime_state', text: 'GraphState 里有当前运行态。' },
            { expected: 'raw_runtime_state', text: 'RuntimeArtifact 记录了结果。' },
            { expected: 'raw_runtime_state', text: 'workflow progress 是第 3 步。' },
            { expected: 'raw_runtime_state', text: 'provider response 里带 usage。' },
            { expected: 'raw_runtime_state', text: 'stack trace: at run (app.ts:10:3)' },
        ] as const

        for (const sample of samples) {
            expect(
                validateUserMemoryCandidate({
                    action: 'add',
                    confidence: 0.95,
                    identity: {
                        subject: '项目信息',
                    },
                    stability: 'stable',
                    source: 'eligible_completed_turn',
                    sourceConversationId: 'conversation-1',
                    sourceText: sample.text,
                    tags: [],
                    text: sample.text,
                    type: 'project_context',
                })
            ).toEqual({
                reason: sample.expected,
                status: 'rejected',
            })
        }
    })

    it('允许正常 project_context 提到 MCP，但拒绝 MCP raw envelope', () => {
        expect(
            validateUserMemoryCandidate({
                action: 'add',
                confidence: 0.95,
                identity: {
                    subject: 'mcp',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '用户正在持续围绕 MCP 接入做版本规划。',
                tags: ['mcp', '规划'],
                text: '用户正在持续围绕 MCP 接入做版本规划。',
                type: 'project_context',
            })
        ).toEqual({
            candidate: expect.objectContaining({
                stableKey: 'project_context:mcp',
                tags: ['mcp', '规划'],
                text: '用户正在持续围绕 MCP 接入做版本规划。',
                type: 'project_context',
            }),
            status: 'accepted',
        })

        expect(
            validateUserMemoryCandidate({
                action: 'add',
                confidence: 0.95,
                identity: {
                    subject: 'mcp',
                },
                stability: 'stable',
                source: 'eligible_completed_turn',
                sourceConversationId: 'conversation-1',
                sourceText: '这是 MCP raw envelope。',
                tags: ['mcp'],
                text: '这是 MCP raw envelope。',
                type: 'project_context',
            })
        ).toEqual({
            reason: 'raw_runtime_state',
            status: 'rejected',
        })
    })

    it('会为 session 派生哈希 namespace 和稳定 stable key', () => {
        expect(buildUserMemoryNamespace('session-1', TEST_ENV)).toEqual([
            'ai-mind',
            'user-memory',
            'v1',
            expect.stringMatching(/^[a-f0-9]{64}$/),
        ])
        expect(buildUserMemoryStableKey('user_preference', { polarity: 'prefer', subject: '桃子' })).toBe('user_preference:prefer-桃子')
        expect(buildUserMemoryStableKey('user_preference', { polarity: 'prefer', subject: '卫衣' })).toBe('user_preference:prefer-卫衣')
    })
})
