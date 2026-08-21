/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantMessage } from '@/components/chat/message-list/messages/assistant-message'
import type { ChatComposerPayload } from '@/lib/ai/types/chat'
import type { ImageBriefPart, MindMessage, WorkflowProgressPart } from '@/lib/ai/types/message'

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

function createWorkflowProgressPart(overrides: Partial<WorkflowProgressPart> = {}) {
    return {
        id: 'workflow-progress-part',
        type: 'workflow-progress' as const,
        workflowId: 'delivery-chain-run-1',
        workflowKind: 'delivery-chain',
        title: '正在生成交付计划...',
        status: 'running' as const,
        steps: [
            {
                id: 'load',
                title: '读取上下文',
                status: 'completed' as const,
                summary: '已读取 demo 上下文 6 项',
                details: [
                    '读取文件：request-limit-banner/requirement.md',
                    '读取文件：context.md',
                    '读取规则：plan-rubric.md、task-rubric.md、review-rubric.md',
                    '读取治理：delivery-boundaries.md、engineering-rules.md',
                ],
                durationMs: 1200,
            },
            {
                id: 'plan',
                title: '方案规划',
                status: 'running' as const,
                summary: '开始方案规划',
                details: ['调用模型：生成方案 (plan)'],
            },
        ],
        visibility: 'expanded' as const,
        ...overrides,
    }
}

function createImageWorkflowProgressPart(overrides: Partial<WorkflowProgressPart> = {}): WorkflowProgressPart {
    return {
        id: 'image-workflow-progress-part',
        type: 'workflow-progress',
        workflowId: 'image-generation-run-1',
        workflowKind: 'image_generation',
        title: '图像生成',
        status: 'running',
        steps: [
            {
                id: 'generation',
                title: '正在生成图片',
                status: 'running',
                details: [],
            },
        ],
        visibility: 'expanded',
        ...overrides,
    }
}

function createImageBriefPart(aspectRatio?: ImageBriefPart['summary']['aspectRatio']): ImageBriefPart {
    return {
        id: 'image-brief-part',
        type: 'image-brief',
        runId: 'run-1',
        summary: {
            assumptions: [],
            avoid: [],
            intent: '插画',
            mustInclude: ['橘猫'],
            scene: '窗边',
            subjects: ['橘猫'],
            ...(aspectRatio ? { aspectRatio } : {}),
        },
    }
}

function renderImageGenerationMessage(parts: MindMessage['parts']) {
    const message: MindMessage = {
        id: 'assistant-image-generation',
        role: 'assistant',
        createdAt: '2026-08-20T10:00:00.000Z',
        parts,
    }

    return render(
        <AssistantMessage
            message={message}
            combinedReasoning=""
            contentParts={message.parts}
            feedbackState={null}
            hasTextContent={false}
            isAssistantReplyCompleted={false}
            isCopied={false}
            isLatestAssistantMessage={true}
            isThinking={false}
            onCopy={vi.fn()}
            onFeedbackChange={vi.fn()}
            onRegenerateLastTurn={vi.fn()}
            onSelectFollowUpQuestion={vi.fn()}
            showFollowUpSuggestions={false}
        />
    )
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

    it('delivery-chain 优先展示 workflow progress 面板，并隐藏重复资源卡片', () => {
        const message: MindMessage = {
            id: 'assistant-delivery-chain',
            role: 'assistant',
            createdAt: '2026-06-29T12:00:00.000Z',
            parts: [
                createWorkflowProgressPart(),
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

        expect(screen.getByText('正在生成交付计划...')).toBeTruthy()
        expect(screen.getByText('读取上下文')).toBeTruthy()
        expect(screen.getByText('调用模型：生成方案 (plan)')).toBeTruthy()
        expect(screen.queryByText('资源读取：plan-rubric.md')).toBeNull()
        expect(screen.queryByText('查看资源预览（最多 3000 字）')).toBeNull()
    })

    it('delivery-chain workflow progress 完成后默认折叠，并支持展开查看步骤', () => {
        const message: MindMessage = {
            id: 'assistant-delivery-chain-completed',
            role: 'assistant',
            createdAt: '2026-06-29T12:05:00.000Z',
            parts: [
                createWorkflowProgressPart({
                    status: 'completed',
                    durationMs: 385000,
                    visibility: 'collapsed',
                    steps: [
                        {
                            id: 'load',
                            title: '读取上下文',
                            status: 'completed',
                            summary: '已读取 demo 上下文 6 项',
                            details: ['读取文件：request-limit-banner/requirement.md'],
                            durationMs: 1200,
                        },
                    ],
                }),
            ],
        }

        render(
            <AssistantMessage
                message={message}
                requestComposer={createDeliveryChainComposer()}
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

        expect(screen.getByText('已处理 6m25s')).toBeTruthy()
        expect(screen.queryByText('读取文件：request-limit-banner/requirement.md')).toBeNull()

        fireEvent.click(screen.getByText('已处理 6m25s'))

        expect(screen.getByText('读取文件：request-limit-banner/requirement.md')).toBeTruthy()
    })

    it('delivery-chain 报告会按 section 展示，并保留 Markdown fallback', () => {
        const message: MindMessage = {
            id: 'assistant-delivery-chain-report',
            role: 'assistant',
            createdAt: '2026-06-29T12:15:00.000Z',
            parts: [
                {
                    id: 'text-report',
                    type: 'text',
                    format: 'markdown',
                    text: [
                        '# Delivery Chain Report / 交付计划报告',
                        '',
                        '> 这是受控规划与评审报告。',
                        '',
                        '## 输入来源',
                        '- demo scenario',
                        '',
                        '## 需求摘要',
                        '需要一个请求上限提示 banner。',
                        '',
                        '## 实现方案',
                        '## 需求理解',
                        '- 在靠近阈值时展示提醒。',
                        '',
                        '## 任务拆解',
                        '- 接入状态判断',
                        '',
                        '## 交付评审',
                        '- 需要人工确认阈值',
                    ].join('\n'),
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

        expect(screen.getByText('交付计划报告')).toBeTruthy()
        expect(screen.getByText('输入来源')).toBeTruthy()
        expect(screen.getByText('需求摘要')).toBeTruthy()
        expect(screen.getByText('实现方案')).toBeTruthy()
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

    it('does not render thread-memory-status part inside the assistant message list', () => {
        const message: MindMessage = {
            id: 'assistant-thread-memory',
            role: 'assistant',
            createdAt: '2026-07-03T12:10:00.000Z',
            parts: [
                {
                    id: 'text-thread-memory',
                    type: 'text',
                    text: '这是本轮回答。',
                    format: 'markdown',
                },
                {
                    id: 'thread-memory-status',
                    type: 'thread-memory-status',
                    status: 'succeeded',
                    message: '上下文已自动压缩',
                    summaryLength: 128,
                    pinnedDecisionCount: 2,
                },
            ],
        }

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
                showFollowUpSuggestions={false}
            />
        )

        expect(screen.getByText('这是本轮回答。')).toBeTruthy()
        expect(screen.queryByRole('status')).toBeNull()
        expect(screen.queryByText('上下文已自动压缩')).toBeNull()
        expect(screen.queryByText('摘要 128 字 · 关键决策 2 条')).toBeNull()
    })

    it('在生成图片步骤开始后直接显示包含流光占位的结果卡片', () => {
        const { container } = renderImageGenerationMessage([createImageWorkflowProgressPart(), createImageBriefPart('landscape')])
        const placeholder = container.querySelector<HTMLElement>('[data-slot="image-generation-preview-placeholder"]')
        const ratioWrapper = placeholder?.querySelector<HTMLElement>('[data-radix-aspect-ratio-wrapper]')
        const skeleton = placeholder?.querySelector<HTMLElement>('[data-slot="skeleton"]')

        expect(placeholder?.querySelector('p')).toBeNull()
        expect(placeholder?.querySelector('.sr-only')?.textContent).toBe('正在生成图片')
        expect(screen.getByText('生成结果')).toBeTruthy()
        expect(screen.getByText('临时结果')).toBeTruthy()
        expect(skeleton).toBeTruthy()
        expect(skeleton?.className).toContain('animate-none')
        expect(placeholder?.querySelectorAll('[data-slot="image-generation-preview-art"] svg')).toHaveLength(2)
        expect(Number.parseFloat(ratioWrapper?.style.paddingBottom ?? '')).toBeCloseTo(75, 2)
    })

    it.each([
        ['portrait', 133.333],
        [undefined, 100],
    ] as const)('为 %s 画幅保留正确的预览比例', (aspectRatio, expectedPaddingBottom) => {
        const { container } = renderImageGenerationMessage([createImageWorkflowProgressPart(), createImageBriefPart(aspectRatio)])
        const ratioWrapper = container.querySelector<HTMLElement>(
            '[data-slot="image-generation-preview-placeholder"] [data-radix-aspect-ratio-wrapper]'
        )

        expect(Number.parseFloat(ratioWrapper?.style.paddingBottom ?? '')).toBeCloseTo(expectedPaddingBottom, 2)
    })

    it('在前置步骤或终态时不显示生成预览骨架', () => {
        const cases: MindMessage['parts'][] = [
            [
                createImageWorkflowProgressPart({
                    steps: [{ id: 'brief', title: '正在整理画面需求', status: 'running', details: [] }],
                }),
                createImageBriefPart(),
            ],
            [createImageWorkflowProgressPart({ status: 'failed' }), createImageBriefPart()],
            [createImageWorkflowProgressPart({ status: 'cancelled' }), createImageBriefPart()],
            [
                createImageWorkflowProgressPart({
                    steps: [{ id: 'generation', title: '正在生成图片', status: 'failed', details: [] }],
                }),
                createImageBriefPart(),
            ],
        ]

        for (const parts of cases) {
            const { container, unmount } = renderImageGenerationMessage(parts)

            expect(container.querySelector('[data-slot="image-generation-preview-placeholder"]')).toBeNull()

            unmount()
        }
    })
})
