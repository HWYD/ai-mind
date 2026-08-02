/** @vitest-environment jsdom */

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    deliveryChainDemoSuggestion,
    tasklistDemoSuggestion,
} from '@/components/chat/message-list/suggestions/empty-state-suggestion-options'
import { EmptyStateSuggestions } from '@/components/chat/message-list/suggestions/empty-state-suggestions'

function mockMatchMedia(matches: boolean) {
    return vi.fn().mockImplementation(() => ({
        matches,
        media: '(hover: hover) and (pointer: fine)',
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

    it('renders the quick start section and three cases', () => {
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={vi.fn()} />)

        expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()
        expect(screen.getAllByRole('article')).toHaveLength(3)
    })

    it('runs the original Tasklist suggestion once through the card interaction without a second footer button', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        const tasklistCase = document.querySelector<HTMLElement>('[aria-labelledby="tasklist-case-title"]')

        expect(tasklistCase).toBeTruthy()
        fireEvent.click(within(tasklistCase as HTMLElement).getByRole('button'))

        expect(onSelectSuggestion).toHaveBeenCalledTimes(1)
        expect(onSelectSuggestion).toHaveBeenCalledWith(tasklistDemoSuggestion)
        expect(tasklistDemoSuggestion.composer?.command?.name).toBe('tasklist')
        expect(tasklistDemoSuggestion.composer?.references).toHaveLength(1)
        expect(tasklistDemoSuggestion.displaySegments).toBeDefined()
    })

    it('runs the original Delivery suggestion once through the card interaction', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        const deliveryCase = document.querySelector<HTMLElement>('[aria-labelledby="delivery-case-title"]')

        expect(deliveryCase).toBeTruthy()
        fireEvent.click(within(deliveryCase as HTMLElement).getByRole('button'))

        expect(onSelectSuggestion).toHaveBeenCalledTimes(1)
        expect(onSelectSuggestion).toHaveBeenCalledWith(deliveryChainDemoSuggestion)
        expect(deliveryChainDemoSuggestion.composer?.command?.name).toBe('delivery-chain')
        expect(deliveryChainDemoSuggestion.composer?.references).toHaveLength(1)
        expect(deliveryChainDemoSuggestion.displaySegments).toBeDefined()
    })

    it('keeps Memory non-submitting and expands the shared steps on touch devices', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        fireEvent.click(screen.getByRole('article', { name: '跨对话偏好记忆' }))
        expect(onSelectSuggestion).not.toHaveBeenCalled()

        const memoryButton = screen.getByRole('button', { name: '查看体验步骤' })
        expect(memoryButton.getAttribute('aria-expanded')).toBe('false')
        fireEvent.click(memoryButton)

        expect(memoryButton.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByText('发送“记住我喜欢吃桃子。”')).toBeTruthy()
        expect(screen.getByText('新建或切换对话。')).toBeTruthy()
        expect(screen.getByText('发送“给我推荐几种水果。”')).toBeTruthy()
        expect(
            memoryButton.compareDocumentPosition(screen.getByLabelText('跨对话偏好记忆体验步骤')) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
        expect(onSelectSuggestion).not.toHaveBeenCalled()

        fireEvent.click(memoryButton)
        expect(memoryButton.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByText('发送“记住我喜欢吃桃子。”')).toBeNull()
    })

    it('uses a focusable Hover Card trigger with the same steps for fine pointers', () => {
        vi.stubGlobal('matchMedia', mockMatchMedia(true))
        vi.useFakeTimers()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={vi.fn()} />)

        expect(screen.queryByRole('button', { name: '查看体验步骤' })).toBeNull()
        const hoverCardTrigger = screen.getByRole('button', { name: '查看跨对话偏好记忆体验步骤' })
        expect(hoverCardTrigger).toBeTruthy()

        fireEvent.pointerEnter(hoverCardTrigger)
        act(() => vi.advanceTimersByTime(200))

        expect(screen.getByRole('heading', { name: '体验跨对话偏好记忆' })).toBeTruthy()
        expect(screen.getByText('发送“记住我喜欢吃桃子。”')).toBeTruthy()
        expect(screen.getByText('新建或切换对话。')).toBeTruthy()
        expect(screen.getByText('发送“给我推荐几种水果。”')).toBeTruthy()
        expect(screen.getByText('请在同一浏览器不同会话内完成体验。')).toBeTruthy()
    })

    it('opens the fine-pointer Hover Card from a click', () => {
        vi.stubGlobal('matchMedia', mockMatchMedia(true))
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: '查看跨对话偏好记忆体验步骤' }))

        expect(screen.getByRole('heading', { name: '体验跨对话偏好记忆' })).toBeTruthy()
        expect(screen.getByText('请在同一浏览器不同会话内完成体验。')).toBeTruthy()
    })

    it('shows desktop recommendation questions only for desktop-sized layouts and reuses the shared follow-up interactions', () => {
        vi.stubGlobal('matchMedia', mockMatchMedia(true))
        const onSelectQuestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={onSelectQuestion} onSelectSuggestion={vi.fn()} />)

        const recommendationGroup = screen.getByRole('group', { name: '推荐问题' })
        const recommendationButtons = within(recommendationGroup).getAllByRole('button')
        const firstQuestion = recommendationButtons[0].textContent ?? ''

        expect(recommendationButtons).toHaveLength(3)

        fireEvent.click(recommendationButtons[0])

        expect(firstQuestion.length).toBeGreaterThan(0)
        expect(onSelectQuestion).toHaveBeenCalledTimes(1)
        expect(onSelectQuestion).toHaveBeenCalledWith(firstQuestion)
    })

    it('disables every quick start operation without submitting a suggestion', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions disabled onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        for (const button of screen.getAllByRole('button')) {
            expect(button.hasAttribute('disabled')).toBe(true)
            fireEvent.click(button)
        }

        expect(onSelectSuggestion).not.toHaveBeenCalled()
        expect(screen.queryByText('发送“记住我喜欢吃桃子。”')).toBeNull()
    })
})
