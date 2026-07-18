/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatAutoScroll } from '@/components/instamind/use-chat-auto-scroll'

class ResizeObserverStub {
    observe() {}

    disconnect() {}
}

function setupAnimationFrameMock() {
    let frameTime = 0
    let frameId = 0
    const timers = new Map<number, number>()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
        const id = ++frameId
        const timer = window.setTimeout(() => {
            frameTime += 16
            timers.delete(id)
            callback(frameTime)
        }, 0)

        timers.set(id, timer)

        return id
    })

    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
        const timer = timers.get(id)

        if (timer === undefined) {
            return
        }

        window.clearTimeout(timer)
        timers.delete(id)
    })
}

function setupPageScrollMetrics(options: { clientHeight?: number; scrollHeight?: number; scrollTop?: number } = {}) {
    let scrollTop = options.scrollTop ?? 0

    Object.defineProperty(document.documentElement, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: value => {
            scrollTop = value
        },
    })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: options.scrollHeight ?? 1000,
    })
    Object.defineProperty(document.documentElement, 'clientHeight', {
        configurable: true,
        value: options.clientHeight ?? 400,
    })

    return {
        resetScrollTop() {
            scrollTop = 0
        },
        setScrollTop(value: number) {
            scrollTop = value
        },
    }
}

function HookHarness({ isStreamingOutput, contentSignal }: { isStreamingOutput: boolean; contentSignal: unknown }) {
    const { inputContainerRef, bottomSpacing, showScrollToBottom, resetAutoScrollForNewTurn, restoreAutoFollowAndScrollToBottom } =
        useChatAutoScroll({
            isStreamingOutput,
            contentSignal,
        })

    return (
        <>
            <div data-testid="state" data-bottom-spacing={bottomSpacing} data-show-scroll-to-bottom={String(showScrollToBottom)} />
            <div ref={inputContainerRef} data-testid="input-container" />
            <input data-testid="editable-input" />
            <button type="button" onClick={resetAutoScrollForNewTurn}>
                reset
            </button>
            <button type="button" onClick={restoreAutoFollowAndScrollToBottom}>
                restore
            </button>
        </>
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    setupAnimationFrameMock()
    setupPageScrollMetrics()
    vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number, y?: number) => {
        if (typeof options === 'object' && options !== null) {
            document.documentElement.scrollTop = Number(options.top ?? 0)
            return
        }

        if (typeof y === 'number') {
            document.documentElement.scrollTop = y
        }
    })
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe('useChatAutoScroll', () => {
    it('用户手动滚动会锁住本轮自动跟随，下一轮重置后恢复', () => {
        const page = setupPageScrollMetrics()
        const { rerender } = render(<HookHarness isStreamingOutput contentSignal="initial" />)

        act(() => {
            vi.advanceTimersByTime(240)
        })

        page.resetScrollTop()
        vi.mocked(window.scrollTo).mockClear()

        fireEvent.wheel(window)
        fireEvent.scroll(window)

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.getByTestId('state').getAttribute('data-show-scroll-to-bottom')).toBe('true')

        rerender(<HookHarness isStreamingOutput contentSignal="locked" />)

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(window.scrollTo).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'reset' }))
        rerender(<HookHarness isStreamingOutput contentSignal="unlocked" />)

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(window.scrollTo).toHaveBeenCalled()
    })

    it('回到底部会隐藏按钮，并在卸载时清理待执行的 rAF', () => {
        const { unmount } = render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.getByTestId('state').getAttribute('data-show-scroll-to-bottom')).toBe('true')

        fireEvent.click(screen.getByRole('button', { name: 'restore' }))

        expect(screen.getByTestId('state').getAttribute('data-show-scroll-to-bottom')).toBe('false')

        unmount()

        expect(window.cancelAnimationFrame).toHaveBeenCalled()
    })

    it('距离底部很近时不会频繁触发自动滚动', () => {
        setupPageScrollMetrics({ scrollTop: 560 })
        render(<HookHarness isStreamingOutput contentSignal="initial" />)
        vi.mocked(window.scrollTo).mockClear()

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('流式自动跟随直接对齐底部，不启动中间缓动滚动', () => {
        render(<HookHarness isStreamingOutput contentSignal="initial" />)

        act(() => {
            vi.advanceTimersByTime(80)
        })

        const scrollTops = vi.mocked(window.scrollTo).mock.calls.map(([options]) => {
            if (typeof options !== 'object' || options === null) {
                return undefined
            }

            return (options as ScrollToOptions).top
        })

        expect(scrollTops).toContain(600)
        expect(scrollTops.every(top => top === 600)).toBe(true)
    })

    it('输入框内滚动不会锁住本轮自动跟随', () => {
        const page = setupPageScrollMetrics()
        const { rerender } = render(<HookHarness isStreamingOutput contentSignal="initial" />)

        act(() => {
            vi.advanceTimersByTime(240)
        })

        page.resetScrollTop()
        vi.mocked(window.scrollTo).mockClear()

        fireEvent.wheel(screen.getByTestId('editable-input'))
        fireEvent.scroll(window)

        rerender(<HookHarness isStreamingOutput contentSignal="next" />)

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(window.scrollTo).toHaveBeenCalled()
    })

    it('流式输出结束后未锁定时会再对齐一次底部', () => {
        const { rerender } = render(<HookHarness isStreamingOutput contentSignal="streaming" />)

        act(() => {
            vi.advanceTimersByTime(240)
        })

        vi.mocked(window.scrollTo).mockClear()
        rerender(<HookHarness isStreamingOutput={false} contentSignal="finished" />)

        act(() => {
            vi.advanceTimersByTime(20)
        })

        expect(window.scrollTo).toHaveBeenCalled()
    })
})
