/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantMessage } from '@/components/chat/message-list/messages/assistant-message'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

afterEach(() => {
    cleanup()
})

function createAssistantMessage(text: string): MindMessage {
    return {
        id: 'assistant-rate-limit',
        role: 'assistant',
        createdAt: '2026-06-14T10:00:00.000Z',
        parts: [
            {
                id: 'text-rate-limit',
                type: 'text',
                text,
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

describe('AssistantMessage', () => {
    it('限额提示会渲染为轻量系统卡片，并隐藏消息操作按钮', () => {
        const message = createAssistantMessage('聊天请求已达到当前 IP 的当日上限（2 次）。')

        render(
            <AssistantMessage
                message={message}
                combinedReasoning=""
                contentParts={message.parts}
                feedbackState={null}
                hasTextContent
                isAssistantReplyCompleted
                isCopied={false}
                isLatestAssistantMessage
                isThinking={false}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions
            />
        )

        expect(screen.getByRole('note', { name: '今日体验次数已用完' })).toBeTruthy()
        expect(screen.getByText('当前 IP 今日最多可体验 2 次，请明天再试。')).toBeTruthy()
        expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('任务清单限额也会复用同一套提示卡片模板', () => {
        const message = createAssistantMessage('任务清单请求已达到当前 IP 的当日上限（2 次）。')

        render(
            <AssistantMessage
                message={message}
                combinedReasoning=""
                contentParts={message.parts}
                feedbackState={null}
                hasTextContent
                isAssistantReplyCompleted
                isCopied={false}
                isLatestAssistantMessage
                isThinking={false}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions
            />
        )

        expect(screen.getByRole('note', { name: '今日体验次数已用完' })).toBeTruthy()
        expect(screen.getByText('当前 IP 今日最多可体验 2 次，请明天再试。')).toBeTruthy()
        expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('在 delivery-chain 场景下只显示紧凑上下文摘要，并在展开后渲染轻量分组列表', () => {
        const message: MindMessage = {
            id: 'assistant-delivery-chain',
            role: 'assistant',
            createdAt: '2026-06-29T12:00:00.000Z',
            parts: [
                createResourcePart('plan-rubric.md', 'demo://rubrics/plan-rubric.md'),
                createResourcePart('task-rubric.md', 'demo://rubrics/task-rubric.md'),
                createResourcePart('review-rubric.md', 'demo://rubrics/review-rubric.md'),
                createResourcePart('delivery-boundaries.md', 'demo://governance/delivery-boundaries.md'),
                createResourcePart('engineering-rules.md', 'demo://governance/engineering-rules.md'),
                createResourcePart('request-limit-banner/requirement.md', 'demo://scenarios/request-limit-banner/requirement.md'),
                createResourcePart('request-limit-banner/context.md', 'demo://scenarios/request-limit-banner/context.md'),
                {
                    id: 'text-report',
                    type: 'text',
                    text: '# Delivery Chain Report / 交付计划报告',
                    format: 'markdown',
                },
            ],
        }

        render(
            <AssistantMessage
                message={message}
                requestComposer={createDeliveryChainComposer()}
                combinedReasoning=""
                contentParts={message.parts}
                feedbackState={null}
                hasTextContent
                isAssistantReplyCompleted
                isCopied={false}
                isLatestAssistantMessage
                isThinking={false}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions={false}
            />
        )

        expect(screen.getByText('已读取 demo 上下文 6 项')).toBeTruthy()
        expect(screen.queryByText('资源读取：plan-rubric.md')).toBeNull()
        expect(screen.queryByText('查看资源预览（最多 3000 字）')).toBeNull()

        fireEvent.click(screen.getByText('展开详情'))

        expect(screen.getByText('入口需求')).toBeTruthy()
        expect(screen.getAllByText('request-limit-banner / requirement.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('场景上下文')).toBeTruthy()
        expect(screen.getAllByText('context.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('评审规则')).toBeTruthy()
        expect(screen.getAllByText('plan-rubric.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('task-rubric.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('review-rubric.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('治理规则')).toBeTruthy()
        expect(screen.getAllByText('delivery-boundaries.md').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('engineering-rules.md').length).toBeGreaterThanOrEqual(1)
    })

    it('非 delivery-chain route 仍保持普通 ResourcePanel 展示', () => {
        const message: MindMessage = {
            id: 'assistant-tasklist-resource',
            role: 'assistant',
            createdAt: '2026-06-29T12:10:00.000Z',
            parts: [createResourcePart('v034-langsmith-observability.md', 'demo://version-plans/v034-langsmith-observability.md')],
        }

        render(
            <AssistantMessage
                message={message}
                requestComposer={{
                    command: {
                        label: '生成任务清单',
                        name: 'tasklist',
                    },
                    plainText: '',
                    references: [],
                }}
                combinedReasoning=""
                contentParts={message.parts}
                feedbackState={null}
                hasTextContent={false}
                isAssistantReplyCompleted
                isCopied={false}
                isLatestAssistantMessage
                isThinking={false}
                onCopy={vi.fn()}
                onFeedbackChange={vi.fn()}
                onRegenerateLastTurn={vi.fn()}
                onSelectFollowUpQuestion={vi.fn()}
                showFollowUpSuggestions={false}
            />
        )

        expect(screen.getByText('资源读取：v034-langsmith-observability.md')).toBeTruthy()
        expect(screen.queryByText(/已读取 demo 上下文/)).toBeNull()
    })
})
