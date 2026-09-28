/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { capabilityTags, featuredQuestions } from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { EmptyStateSuggestions } from '@/components/chat/message-list/suggestions/empty-state-suggestions'

function mockMatchMedia(matches: boolean) {
    return vi.fn().mockImplementation(() => ({
        matches,
        media: '(min-width: 768px)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))
}

describe('EmptyStateSuggestions', () => {
    beforeEach(() => {
        vi.stubGlobal('matchMedia', mockMatchMedia(false))
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('renders the new empty-state layout with title, subtitle, capability tags and featured cards', () => {
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} />)

        // 主标题与副标题
        expect(screen.getByRole('heading', { level: 2, name: '你可以这样开始' })).toBeTruthy()
        expect(screen.getByText('选择一个问题，体验 Agent 如何搜索资料、读取网页并调用工具完成任务。')).toBeTruthy()

        // 能力标签
        for (const tag of capabilityTags) {
            expect(screen.getByText(tag.label)).toBeTruthy()
        }

        // 3 个精选问题卡片（按钮）
        const buttons = screen.getAllByRole('button')
        expect(buttons).toHaveLength(featuredQuestions.length)
        for (const question of featuredQuestions) {
            expect(screen.getByRole('button', { name: question.text })).toBeTruthy()
        }
    })

    it('calls onSelectQuestion with the question text when a featured card is clicked', () => {
        const onSelectQuestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={onSelectQuestion} />)

        const firstQuestion = featuredQuestions[0]
        fireEvent.click(screen.getByRole('button', { name: firstQuestion.text }))

        expect(onSelectQuestion).toHaveBeenCalledTimes(1)
        expect(onSelectQuestion).toHaveBeenCalledWith(firstQuestion.text)
    })

    it('disables all featured cards when disabled is true', () => {
        const onSelectQuestion = vi.fn()
        render(<EmptyStateSuggestions disabled onSelectQuestion={onSelectQuestion} />)

        const buttons = screen.getAllByRole('button')
        expect(buttons.length).toBeGreaterThan(0)

        for (const button of buttons) {
            expect(button.hasAttribute('disabled')).toBe(true)
            fireEvent.click(button)
        }

        expect(onSelectQuestion).not.toHaveBeenCalled()
    })

    it('accepts optional onSelectSuggestion prop without rendering suggestion cards', () => {
        // 保持对旧 prop 的类型兼容，但不用于当前 UI
        const onSelectSuggestion = vi.fn()
        const { container } = render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        // 不存在旧版的 article 卡片
        expect(container.querySelectorAll('article')).toHaveLength(0)
        expect(onSelectSuggestion).not.toHaveBeenCalled()
    })
})
