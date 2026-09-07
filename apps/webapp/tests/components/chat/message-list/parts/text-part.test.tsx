/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TextPartView } from '@/components/chat/message-list/parts/text-part'

vi.mock('streamdown', () => ({
    Streamdown: ({
        animated,
        caret,
        children,
        isAnimating,
        mode,
    }: {
        animated?: boolean | { animation?: string; duration?: number; easing?: string; sep?: string; stagger?: number }
        caret?: 'block' | 'circle'
        children: string
        isAnimating?: boolean
        mode?: 'static' | 'streaming'
    }) => (
        <output
            data-animated={typeof animated === 'object' ? JSON.stringify(animated) : String(animated)}
            data-caret={String(caret)}
            data-is-animating={String(isAnimating)}
            data-mode={mode}
        >
            {children}
        </output>
    ),
}))

afterEach(() => {
    cleanup()
})

const part = {
    format: 'markdown' as const,
    id: 'text-part',
    text: '流式回答',
    type: 'text' as const,
}

describe('TextPartView', () => {
    it('完成后仍保持 streaming Markdown 与稳定动画配置，只停止动画', () => {
        const page = render(<TextPartView part={part} />)

        const output = screen.getByText('流式回答')

        expect(output.getAttribute('data-mode')).toBe('streaming')
        expect(output.getAttribute('data-is-animating')).toBe('false')
        expect(JSON.parse(output.getAttribute('data-animated') ?? '{}')).toEqual({
            animation: 'fadeIn',
            duration: 24,
            easing: 'ease-out',
            sep: 'word',
            stagger: 0,
        })
        expect(output.getAttribute('data-caret')).toBe('undefined')

        page.rerender(<TextPartView part={part} isStreaming />)
        expect(output.getAttribute('data-mode')).toBe('streaming')
        expect(output.getAttribute('data-is-animating')).toBe('true')
        expect(output.getAttribute('data-animated')).toBe(
            JSON.stringify({ animation: 'fadeIn', duration: 24, easing: 'ease-out', sep: 'word', stagger: 0 })
        )

        page.rerender(<TextPartView part={part} />)
        expect(output.getAttribute('data-mode')).toBe('streaming')
        expect(output.getAttribute('data-is-animating')).toBe('false')
    })

    it('流式消息使用轻量淡入动画，不显示尾部光标', () => {
        render(<TextPartView part={part} isStreaming />)

        const output = screen.getByText('流式回答')

        expect(output.getAttribute('data-mode')).toBe('streaming')
        expect(output.getAttribute('data-is-animating')).toBe('true')
        expect(JSON.parse(output.getAttribute('data-animated') ?? '{}')).toEqual({
            animation: 'fadeIn',
            duration: 24,
            easing: 'ease-out',
            sep: 'word',
            stagger: 0,
        })
        expect(output.getAttribute('data-caret')).toBe('undefined')
    })
})
