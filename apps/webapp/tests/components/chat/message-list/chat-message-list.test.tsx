/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
import { getMessageCopyText } from '@/components/chat/message-list/shared/message-list-utils'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

const assistantMessageRenderSpy = vi.hoisted(() => vi.fn())

vi.mock('@/components/chat/message-list/messages/assistant-message', async importOriginal => {
    const actual = await importOriginal<typeof import('@/components/chat/message-list/messages/assistant-message')>()
    const react = await import('react')

    return {
        ...actual,
        AssistantMessage(props: Parameters<typeof actual.AssistantMessage>[0]) {
            assistantMessageRenderSpy(props)
            return react.createElement(actual.AssistantMessage, props)
        },
    }
})

afterEach(() => {
    cleanup()
    assistantMessageRenderSpy.mockClear()
})

function createAssistantMessage(id = 'assistant-reasoning', text = '最终答案'): MindMessage {
    return {
        id,
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

describe('ChatMessageList', () => {
    it('copies a command chip with its stable command name', () => {
        const message: MindMessage = {
            id: 'user-image',
            role: 'user',
            createdAt: '2026-08-01T10:00:00.000Z',
            parts: [
                {
                    type: 'text',
                    text: '生成猫咪照片',
                    format: 'markdown',
                    displaySegments: [
                        { type: 'command', command: { label: '生成图片', name: 'image' } },
                        { type: 'text', text: ' 生成猫咪照片' },
                    ],
                },
            ],
        }

        expect(getMessageCopyText(message)).toBe('/image 生成猫咪照片')
    })

    it('隐藏深度思考时不展示 reasoning 面板', () => {
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

    it('hides empty-state suggestions when the parent marks the empty state as non-draft', () => {
        render(
            <ChatMessageList
                messages={[]}
                status="ready"
                enableReasoning={false}
                showEmptyStateSuggestions={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.queryByText('试试这些能力')).toBeNull()
    })

    it('keeps completed-reply recommendations in the tree while their actions are temporarily unavailable', () => {
        render(
            <ChatMessageList
                actionsDisabled
                messages={[createAssistantMessage()]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={vi.fn()}
                onSelectSuggestion={vi.fn()}
            />
        )

        const recommendationButtons = within(screen.getByRole('group', { name: '推荐问题' })).getAllByRole('button')

        expect(recommendationButtons).toHaveLength(3)
        expect(recommendationButtons.every(button => (button as HTMLButtonElement).disabled)).toBe(true)
    })

    it('only rerenders the latest assistant message when recommendation actions become disabled', () => {
        const messages = [createAssistantMessage('assistant-history', '历史回复'), createAssistantMessage('assistant-latest', '最新回复')]
        const props = {
            enableReasoning: false,
            messages,
            status: 'ready' as const,
            onDeleteUserTurn: vi.fn(() => true),
            onRegenerateLastTurn: vi.fn(() => true),
            onSelectFollowUpQuestion: vi.fn(),
            onSelectSuggestion: vi.fn(),
        }
        const page = render(<ChatMessageList {...props} />)

        assistantMessageRenderSpy.mockClear()
        page.rerender(<ChatMessageList {...props} actionsDisabled />)

        expect(assistantMessageRenderSpy).toHaveBeenCalledTimes(1)
        expect(assistantMessageRenderSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                followUpSuggestionsDisabled: true,
                message: expect.objectContaining({ id: 'assistant-latest' }),
            })
        )
    })

    it('renders image summary and result parts after an image generation task completes', async () => {
        const message: MindMessage = {
            id: 'assistant-image-result',
            role: 'assistant',
            createdAt: '2026-08-01T10:00:00.000Z',
            parts: [
                {
                    id: 'image-brief-1',
                    type: 'image-brief',
                    runId: 'run-1',
                    summary: {
                        assumptions: [],
                        avoid: [],
                        intent: '一只晒太阳的猫',
                        mustInclude: [],
                        scene: '阳台',
                        subjects: ['猫'],
                    },
                },
                {
                    id: 'image-result-1',
                    type: 'image-result',
                    runId: 'run-1',
                    contentPath: '/api/chat/runs/run-1/image',
                    expiresAt: '2000-01-01T00:00:00.000Z',
                    suggestedFileName: 'cat.png',
                    temporary: true,
                },
            ],
        }

        const onSelectFollowUpQuestion = vi.fn()

        render(
            <ChatMessageList
                messages={[message]}
                status="ready"
                enableReasoning={false}
                onDeleteUserTurn={vi.fn(() => true)}
                onRegenerateLastTurn={vi.fn(() => true)}
                onSelectFollowUpQuestion={onSelectFollowUpQuestion}
                onSelectSuggestion={vi.fn()}
            />
        )

        expect(screen.getByText('图像生成摘要')).toBeTruthy()
        expect(screen.getByText('生成结果')).toBeTruthy()

        const recommendationButtons = within(screen.getByRole('group', { name: '推荐问题' })).getAllByRole('button')
        await waitFor(() => expect(screen.getByText(/临时图片已过期/)).toBeTruthy())
        const selectedQuestion = recommendationButtons[0].textContent ?? ''

        fireEvent.click(recommendationButtons[0])

        expect(onSelectFollowUpQuestion).toHaveBeenCalledWith(selectedQuestion)
    })
})
