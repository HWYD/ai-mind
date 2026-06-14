/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssistantMessage } from '@/components/chat/message-list/messages/assistant-message'
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
        expect(screen.getByText('今日体验次数已用完')).toBeTruthy()
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
})
