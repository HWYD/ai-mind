/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatAutoScroll } from '@/components/instamind/use-chat-auto-scroll'

class ResizeObserverStub {
    static instances: ResizeObserverStub[] = []

    private readonly targets = new Set<Element>()

    constructor(private readonly callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this)
    }

    observe(target: Element) {
        this.targets.add(target)
    }

    disconnect() {
        this.targets.clear()
    }

    static trigger(target: Element) {
        ResizeObserverStub.triggerEntries(target)
    }

    static triggerEntries(...targets: Element[]) {
        for (const observer of ResizeObserverStub.instances) {
            const entries = targets.filter(target => observer.targets.has(target)).map(target => ({ target }) as ResizeObserverEntry)

            if (entries.length > 0) {
                observer.callback(entries, observer as unknown as ResizeObserver)
            }
        }
    }
}

type ViewportMetrics = {
    clearScrollTopWrites(): void
    scrollTopWrites: readonly number[]
    setClientHeight(value: number): void
    setScrollHeight(value: number): void
    setScrollTop(value: number): void
}

type ViewportScrollContract = ReturnType<typeof useChatAutoScroll> & {
    composerContainerRef?: RefObject<HTMLDivElement | null>
    composerOverlayInset?: number
    messageContentRef?: RefObject<HTMLDivElement | null>
    scrollViewportRef?: RefObject<HTMLDivElement | null>
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

function setupPageScrollMetrics() {
    Object.defineProperties(document.documentElement, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, value: 0, writable: true },
    })
}

function setupViewportMetrics(viewport: HTMLElement, options: { clientHeight?: number; scrollHeight?: number; scrollTop?: number } = {}) {
    let clientHeight = options.clientHeight ?? 400
    let scrollHeight = options.scrollHeight ?? 1000
    let scrollTop = options.scrollTop ?? 0
    const scrollTopWrites: number[] = []

    Object.defineProperties(viewport, {
        clientHeight: {
            configurable: true,
            get: () => clientHeight,
        },
        scrollHeight: {
            configurable: true,
            get: () => scrollHeight,
        },
        scrollTop: {
            configurable: true,
            get: () => scrollTop,
            set: value => {
                scrollTop = Number(value)
                scrollTopWrites.push(scrollTop)
            },
        },
    })

    return {
        clearScrollTopWrites() {
            scrollTopWrites.length = 0
        },
        scrollTopWrites,
        setClientHeight(value: number) {
            clientHeight = value
        },
        setScrollHeight(value: number) {
            scrollHeight = value
        },
        setScrollTop(value: number) {
            scrollTop = value
        },
    } satisfies ViewportMetrics
}

function HookHarness({ isStreamingOutput, contentSignal }: { isStreamingOutput: boolean; contentSignal: unknown }) {
    const autoScroll = useChatAutoScroll({
        isStreamingOutput,
        contentSignal,
    }) as ViewportScrollContract
    const {
        composerContainerRef,
        composerOverlayInset,
        messageContentRef,
        positionConversationEntryAtBottom,
        resetAutoScrollForNewTurn,
        restoreAutoFollowAndScrollToBottom,
        scrollViewportRef,
        showScrollToBottom,
    } = autoScroll

    return (
        <>
            <div
                ref={scrollViewportRef}
                tabIndex={0}
                data-testid="message-viewport"
                data-show-scroll-to-bottom={String(showScrollToBottom)}
            >
                <div ref={messageContentRef} data-testid="message-content" />
            </div>
            <div ref={composerContainerRef} data-testid="composer-container" />
            <output data-testid="composer-overlay-inset">{String(composerOverlayInset)}</output>
            <button type="button" onClick={resetAutoScrollForNewTurn}>
                reset
            </button>
            <button type="button" onClick={restoreAutoFollowAndScrollToBottom}>
                restore
            </button>
            <button type="button" onClick={() => positionConversationEntryAtBottom()}>
                position entry
            </button>
        </>
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    ResizeObserverStub.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    setupAnimationFrameMock()
    setupPageScrollMetrics()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe('useChatAutoScroll', () => {
    it('流式跟随只写入消息视口，不调用 window.scrollTo', () => {
        render(<HookHarness isStreamingOutput contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        setupViewportMetrics(viewport)

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(viewport.scrollTop).toBe(600)
        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('A→B 会话进入会取消 A 的 rAF 校正，只保留 B 的消息视口定位', () => {
        const page = render(<HookHarness isStreamingOutput={false} contentSignal="conversation-a" />)
        const viewport = screen.getByTestId('message-viewport')
        const metrics = setupViewportMetrics(viewport)
        vi.mocked(window.scrollTo).mockClear()

        act(() => {
            vi.advanceTimersByTime(1)
        })
        metrics.clearScrollTopWrites()
        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        page.rerender(<HookHarness isStreamingOutput={false} contentSignal="conversation-b" />)
        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(window.cancelAnimationFrame).toHaveBeenCalled()
        expect(viewport.scrollTop).toBe(600)
        expect(metrics.scrollTopWrites).toEqual([600, 600, 600])
        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('Composer 变高前贴底时重新对齐最新消息', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const composer = screen.getByTestId('composer-container')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 600 })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 100,
            height: 100,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        metrics.setClientHeight(300)
        act(() => {
            ResizeObserverStub.trigger(composer)
        })
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(viewport.scrollTop).toBe(700)
    })

    it('Composer 的实测高度成为悬浮安全区，并在贴底时对齐新的末尾', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const composer = screen.getByTestId('composer-container')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 600 })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 144,
            height: 144,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        metrics.setScrollHeight(1144)
        act(() => {
            ResizeObserverStub.trigger(composer)
        })
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(screen.getByTestId('composer-overlay-inset').textContent).toBe('144')
        expect(viewport.scrollTop).toBe(744)
    })

    it('Composer 安全区提交后才调度贴底校正', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const composer = screen.getByTestId('composer-container')
        const scheduledInsets: string[] = []

        vi.mocked(window.requestAnimationFrame).mockImplementation(() => {
            scheduledInsets.push(screen.getByTestId('composer-overlay-inset').textContent ?? '')
            return 1
        })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 144,
            height: 144,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        act(() => {
            ResizeObserverStub.trigger(composer)
        })

        expect(screen.getByTestId('composer-overlay-inset').textContent).toBe('144')
        expect(scheduledInsets).toEqual(['144'])
    })

    it('Composer 与消息内容同时变化时也等安全区提交后才校正', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const composer = screen.getByTestId('composer-container')
        const messageContent = screen.getByTestId('message-content')
        const scheduledInsets: string[] = []

        vi.mocked(window.requestAnimationFrame).mockImplementation(() => {
            scheduledInsets.push(screen.getByTestId('composer-overlay-inset').textContent ?? '')
            return 1
        })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 144,
            height: 144,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        act(() => {
            ResizeObserverStub.triggerEntries(composer, messageContent)
        })

        expect(screen.getByTestId('composer-overlay-inset').textContent).toBe('144')
        expect(scheduledInsets).toEqual(['144'])
    })

    it('Composer 变高时不会改写正在阅读历史的消息视口位置', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const composer = screen.getByTestId('composer-container')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 160 })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 100,
            height: 100,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        fireEvent.scroll(viewport)
        metrics.setClientHeight(300)
        act(() => {
            ResizeObserverStub.trigger(composer)
        })
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(viewport.scrollTop).toBe(160)
    })

    it('Composer resize 已排队后用户上滑时不会在下一帧被拉回底部', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const composer = screen.getByTestId('composer-container')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 600 })
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 100,
            height: 100,
            left: 0,
            right: 400,
            top: 0,
            width: 400,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })

        metrics.setClientHeight(300)
        act(() => {
            ResizeObserverStub.trigger(composer)
        })
        metrics.setScrollTop(160)
        fireEvent.scroll(viewport)
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(viewport.scrollTop).toBe(160)
    })

    it('历史内容在初次进入后继续增高时，贴底消息视口会对齐新的真实末尾', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const messageContent = screen.getByTestId('message-content')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 600 })

        metrics.setScrollHeight(1200)
        ResizeObserverStub.trigger(messageContent)
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(viewport.scrollTop).toBe(800)
    })

    it('历史内容在用户上滑后继续增高时不改变阅读位置', () => {
        render(<HookHarness isStreamingOutput={false} contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const messageContent = screen.getByTestId('message-content')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 160 })

        fireEvent.scroll(viewport)
        metrics.setScrollHeight(1200)
        ResizeObserverStub.trigger(messageContent)
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(viewport.scrollTop).toBe(160)
    })

    it('用户上滑会锁住本轮跟随，手动回到底部后恢复消息视口跟随', () => {
        const page = render(<HookHarness isStreamingOutput contentSignal="initial" />)
        const viewport = screen.getByTestId('message-viewport')
        const metrics = setupViewportMetrics(viewport, { scrollTop: 600 })

        act(() => {
            vi.advanceTimersByTime(80)
        })

        metrics.setScrollTop(0)
        fireEvent.wheel(viewport)
        fireEvent.scroll(viewport)
        page.rerender(<HookHarness isStreamingOutput contentSignal="locked" />)
        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(viewport.scrollTop).toBe(0)
        expect(viewport.getAttribute('data-show-scroll-to-bottom')).toBe('true')

        fireEvent.click(screen.getByRole('button', { name: 'restore' }))
        act(() => {
            vi.advanceTimersByTime(240)
        })

        expect(viewport.scrollTop).toBe(600)
        expect(viewport.getAttribute('data-show-scroll-to-bottom')).toBe('false')
    })
})
