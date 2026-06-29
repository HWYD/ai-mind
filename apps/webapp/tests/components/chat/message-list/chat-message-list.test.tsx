/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
})

function createAssistantMessage(): MindMessage {
    return {
        id: 'assistant-reasoning',
        role: 'assistant',
        createdAt: '2026-06-16T10:00:00.000Z',
        parts: [
            {
                id: 'reasoning-1',
                type: 'reasoning',
                text: '先分析用户问题，再组织最终回答。',
                format: 'markdown',
                visibility: 'collapsed',
            },
            {
                id: 'text-1',
                type: 'text',
                text: '最终答案',
                format: 'markdown',
            },
        ],
    }
}

function createDeliveryChainComposer(): ChatComposerPayload {
    return {
        command: {
            label: '生成交付计划',
            name: 'delivery-chain',
        },
        plainText: '',
        references: [
            {
                id: 'demo:scenario:request-limit-banner/requirement.md',
                label: 'request-limit-banner/requirement.md',
                source: 'local',
                type: 'resource',
                uri: 'demo://scenarios/request-limit-banner/requirement.md',
            },
        ],
    }
}

function createResourcePart(resourceName: string, uri: string) {
    return {
        id: uri,
        type: 'resource' as const,
        contentPreview: `preview for ${resourceName}`,
        location: 'local' as const,
        resourceName,
        serverId: 'project-docs-server',
        source: 'mcp' as const,
        status: 'completed' as const,
        uri,
    }
}

describe('ChatMessageList', () => {
    it('关闭深度思考时不展示 reasoning 面板', () => {
        render(
            <ChatMessageList
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('最终答案')).toBeTruthy()
        expect(screen.queryByText('已完成思考')).toBeNull()
        expect(screen.queryByText('先分析用户问题，再组织最终回答。')).toBeNull()
    })

    it('开启深度思考时展示 reasoning 面板', () => {
        render(
            <ChatMessageList
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('最终答案')).toBeTruthy()
        expect(screen.getByText('已完成思考')).toBeTruthy()
        expect(screen.getByText('先分析用户问题，再组织最终回答。')).toBeTruthy()
    })

    it('会把上一条 user composer 传给 delivery-chain assistant message，用于聚合内部 demo resources', () => {
        const messages: MindMessage[] = [
            {
                id: 'user-delivery-chain',
                role: 'user',
                createdAt: '2026-06-29T12:00:00.000Z',
                composer: createDeliveryChainComposer(),
                parts: [
                    {
                        id: 'user-text',
                        type: 'text',
                        text: '/delivery-chain + @demo://scenarios/request-limit-banner/requirement.md',
                        format: 'markdown',
                    },
                ],
            },
            {
                id: 'assistant-delivery-chain',
                role: 'assistant',
                createdAt: '2026-06-29T12:00:01.000Z',
                parts: [
                    createResourcePart('plan-rubric.md', 'demo://rubrics/plan-rubric.md'),
                    createResourcePart('task-rubric.md', 'demo://rubrics/task-rubric.md'),
                    createResourcePart('review-rubric.md', 'demo://rubrics/review-rubric.md'),
                    createResourcePart('delivery-boundaries.md', 'demo://governance/delivery-boundaries.md'),
                    createResourcePart('engineering-rules.md', 'demo://governance/engineering-rules.md'),
                    createResourcePart('request-limit-banner/requirement.md', 'demo://scenarios/request-limit-banner/requirement.md'),
                    createResourcePart('request-limit-banner/context.md', 'demo://scenarios/request-limit-banner/context.md'),
                    {
                        id: 'report-text',
                        type: 'text',
                        text: '# Delivery Chain Report / 交付计划报告',
                        format: 'markdown',
                    },
                ],
            },
        ]

        render(
            <ChatMessageList
                messages={messages}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('已读取 demo 上下文 6 项')).toBeTruthy()
        expect(screen.queryByText('资源读取：plan-rubric.md')).toBeNull()
    })
})
