/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ChatMessageList } from '@/components/chat/message-list/chat-message-list'
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
})
