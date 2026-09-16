/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    deliveryChainDemoSuggestion,
    generalReActDemoSuggestion,
    imageGenerationDemoSuggestion,
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

    it('renders the ReAct case first and keeps four cases without Memory', () => {
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={vi.fn()} />)

        expect(screen.getByRole('heading', { level: 2 })).toBeTruthy()
        expect(screen.getByRole('heading', { name: '试试这些能力' })).toBeTruthy()
        expect(screen.getByText('选择一个场景，查看执行过程、控制边界与最终产物。')).toBeTruthy()
        const cases = screen.getAllByRole('article')

        expect(cases).toHaveLength(4)
        expect(within(cases[0]).getByRole('heading', { name: '搜索并解读 React 19 教程' })).toBeTruthy()
        expect(screen.getByText('Web Search · 网页读取 · 来源追踪')).toBeTruthy()
        expect(screen.getByText('LangGraph · HITL Checkpoint · 最多两轮修订')).toBeTruthy()
        expect(screen.getByText('Agent-as-Tool · 3 个评审 subAgent · 结构化')).toBeTruthy()
        expect(screen.getByText('图像需求摘要 · 结构化输出 · 最多一次修订')).toBeTruthy()
        expect(screen.queryByRole('article', { name: '跨对话偏好记忆' })).toBeNull()
        expect(screen.queryByText('LangGraph · HITL Checkpoint · 最多两轮受控修订')).toBeNull()
        expect(screen.queryByText('Agent-as-Tool · 3 个评审子 Agent 并行 · 规则汇总')).toBeNull()
        expect(screen.queryByText('UserMemory · PostgresStore · Vector Search')).toBeNull()
    })

    it('runs the General ReAct suggestion once through the first card interaction', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        fireEvent.click(screen.getByRole('button', { name: '运行 ReAct 智能体示例' }))

        expect(onSelectSuggestion).toHaveBeenCalledTimes(1)
        expect(onSelectSuggestion).toHaveBeenCalledWith(generalReActDemoSuggestion)
        expect(generalReActDemoSuggestion.composer).toBeUndefined()
        expect(generalReActDemoSuggestion.text).toBe(
            '帮我搜一下「React 19 服务端组件」怎么上手，选一篇掘金或知乎上的中文教程读一下，总结关键步骤。'
        )
    })

    it('runs the original Tasklist suggestion once through the card interaction without a second footer button', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        expect(screen.getAllByRole('button')).toHaveLength(4)
        expect(screen.queryByRole('button', { name: '运行示例' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: '运行受控任务规划示例' }))

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

    it('runs the Image Agent shortcut as an immediate /image submission', () => {
        const onSelectSuggestion = vi.fn()
        render(<EmptyStateSuggestions onSelectQuestion={vi.fn()} onSelectSuggestion={onSelectSuggestion} />)

        fireEvent.click(screen.getByRole('button', { name: '运行 AI 图像生成示例' }))

        expect(onSelectSuggestion).toHaveBeenCalledTimes(1)
        expect(onSelectSuggestion).toHaveBeenCalledWith(imageGenerationDemoSuggestion)
        expect(imageGenerationDemoSuggestion.composer?.command?.name).toBe('image')
        expect(imageGenerationDemoSuggestion.composer?.plainText).toBe('阳光正好，一只橘猫在沙滩上睡懒觉。')
        expect(imageGenerationDemoSuggestion.displaySegments).toBeDefined()
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
