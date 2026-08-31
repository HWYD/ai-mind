/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessageListHandle } from '@/components/chat/message-list/chat-message-list'
import { useChatScrollPolicy } from '@/components/instamind/use-chat-scroll-policy'

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
        for (const observer of ResizeObserverStub.instances) {
            if (observer.targets.has(target)) {
                observer.callback([{ target } as ResizeObserverEntry], observer as unknown as ResizeObserver)
            }
        }
    }
}

function HookHarness({
    contentSignal,
    isStreamingOutput,
    onPositioned,
    scrollToEnd,
}: {
    contentSignal: unknown
    isStreamingOutput: boolean
    onPositioned?: () => void
    scrollToEnd: ChatMessageListHandle['scrollToEnd']
}) {
    const listRef = useRef<ChatMessageListHandle | null>({ scrollToEnd })
    const [scrollViewportElement, setScrollViewportElement] = useState<HTMLDivElement | null>(null)
    const {
        composerContainerRef,
        composerOverlayInset,
        cancelConversationEntryPositioning,
        onAtBottomChange,
        onItemMounted,
        onItemUnmounted,
        onRangeChange,
        onScrollingChange,
        onTotalHeightChange,
        positionConversationEntryAtBottom,
        resetScrollPolicyForNewTurn,
        restoreFollowAndScrollToEnd,
        showScrollToBottom,
    } = useChatScrollPolicy({
        contentSignal,
        isStreamingOutput,
        listRef,
        messageCount: 20,
        scrollViewportElement,
    })
    const setViewportRef = useCallback((node: HTMLDivElement | null) => {
        setScrollViewportElement(current => (current === node ? current : node))
    }, [])

    return (
        <>
            <div ref={setViewportRef} data-testid="message-viewport" />
            <div ref={composerContainerRef} data-testid="composer-container" />
            <output data-testid="composer-overlay-inset">{String(composerOverlayInset)}</output>
            <output data-testid="show-scroll-to-bottom">{String(showScrollToBottom)}</output>
            <button type="button" onClick={() => onTotalHeightChange(1200)}>
                total height changed
            </button>
            <button type="button" onClick={() => onTotalHeightChange(1200, { conversationId: 'conversation-a', sequence: 1 })}>
                entry total height changed
            </button>
            <button
                type="button"
                onClick={() => onRangeChange({ startIndex: 15, endIndex: 19 }, { conversationId: 'conversation-a', sequence: 1 })}
            >
                tail range
            </button>
            <button
                type="button"
                onClick={() => onRangeChange({ startIndex: 15, endIndex: 19 }, { conversationId: 'conversation-b', sequence: 2 })}
            >
                next tail range
            </button>
            <button type="button" onClick={() => onItemMounted({ conversationId: 'conversation-a', itemIndex: 19, sequence: 1 })}>
                mount last item
            </button>
            <button type="button" onClick={() => onItemUnmounted({ conversationId: 'conversation-a', itemIndex: 19, sequence: 1 })}>
                unmount last item
            </button>
            <button type="button" onClick={() => onItemMounted({ conversationId: 'conversation-b', itemIndex: 19, sequence: 2 })}>
                mount next last item
            </button>
            <button type="button" onClick={() => onAtBottomChange(true, { conversationId: 'conversation-a', sequence: 1 })}>
                at bottom
            </button>
            <button type="button" onClick={() => onAtBottomChange(true, { conversationId: 'conversation-b', sequence: 2 })}>
                next at bottom
            </button>
            <button type="button" onClick={() => onAtBottomChange(false, { conversationId: 'conversation-a', sequence: 1 })}>
                away from bottom
            </button>
            <button type="button" onClick={() => onScrollingChange(true, { conversationId: 'conversation-a', sequence: 1 })}>
                scrolling
            </button>
            <button
                type="button"
                onClick={() => onRangeChange({ startIndex: 0, endIndex: 3 }, { conversationId: 'conversation-a', sequence: 1 })}
            >
                far range
            </button>
            <button type="button" onClick={restoreFollowAndScrollToEnd}>
                restore
            </button>
            <button type="button" onClick={resetScrollPolicyForNewTurn}>
                reset turn
            </button>
            <button type="button" onClick={cancelConversationEntryPositioning}>
                cancel entry
            </button>
            <button
                type="button"
                onClick={() =>
                    positionConversationEntryAtBottom({ conversationId: 'conversation-a', lastMessageIndex: 19, sequence: 1 }, onPositioned)
                }
            >
                position entry
            </button>
            <button
                type="button"
                onClick={() =>
                    positionConversationEntryAtBottom({ conversationId: 'conversation-b', lastMessageIndex: 19, sequence: 2 }, onPositioned)
                }
            >
                position next entry
            </button>
        </>
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    ResizeObserverStub.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(performance.now()), 0))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id))
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('useChatScrollPolicy contract', () => {
    it('delegates streaming follow to ChatMessageListHandle without reading or writing raw scroll metrics', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="first-token" isStreamingOutput scrollToEnd={scrollToEnd} />)

        const viewport = screen.getByTestId('message-viewport')
        const scrollTopWrites: number[] = []
        Object.defineProperties(viewport, {
            clientHeight: { configurable: true, value: 400 },
            scrollHeight: { configurable: true, value: 1000 },
            scrollTop: {
                configurable: true,
                get: () => 0,
                set: value => scrollTopWrites.push(Number(value)),
            },
        })

        act(() => {
            vi.advanceTimersByTime(80)
        })

        expect(scrollToEnd).toHaveBeenCalledWith('auto')
        expect(scrollTopWrites).toEqual([])
        expect(window.scrollTo).not.toHaveBeenCalled()
    })

    it('reveals history only after bottom, tail range, and the last item DOM commit survive entry positioning', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))

        expect(scrollToEnd).toHaveBeenCalledWith('auto')
        expect(onPositioned).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('uses a matching last-item DOM commit observed before entry positioning begins', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('does not reveal when the last item unmounts before the reveal frame', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        fireEvent.click(screen.getByRole('button', { name: 'unmount last item' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).not.toHaveBeenCalled()
        expect(scrollToEnd).toHaveBeenCalledTimes(2)
    })

    it('does not reuse a committed last item from a previous conversation generation', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'position next entry' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(onPositioned).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'next tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'next at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount next last item' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('retries a hidden history entry when the first command leaves the last item out of range', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'far range' }))
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(scrollToEnd).toHaveBeenCalledTimes(2)
        expect(scrollToEnd).toHaveBeenLastCalledWith('auto')
        expect(onPositioned).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('retries instead of revealing when bottom readiness regresses before the commit frame', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).not.toHaveBeenCalled()
        expect(scrollToEnd).toHaveBeenCalledTimes(2)
        expect(scrollToEnd).toHaveBeenLastCalledWith('auto')

        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('coalesces pending history height changes into the next-frame positioning retry', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: /^position entry$/ }))
        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(scrollToEnd).toHaveBeenCalledTimes(2)

        fireEvent.click(screen.getByRole('button', { name: 'entry total height changed' }))
        fireEvent.click(screen.getByRole('button', { name: 'entry total height changed' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(scrollToEnd).toHaveBeenCalledTimes(3)
        expect(scrollToEnd).toHaveBeenLastCalledWith('auto')
    })

    it('upgrades a queued retry after a height change and reveals again without requiring another observation', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        fireEvent.click(screen.getByRole('button', { name: 'entry total height changed' }))
        act(() => vi.advanceTimersToNextTimer())
        expect(scrollToEnd).toHaveBeenCalledTimes(2)
        expect(onPositioned).not.toHaveBeenCalled()

        act(() => vi.advanceTimersToNextTimer())
        expect(onPositioned).not.toHaveBeenCalled()

        act(() => vi.advanceTimersToNextTimer())
        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('ignores stale list observations from the previous conversation generation', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'position next entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'scrolling' }))
        fireEvent.click(screen.getByRole('button', { name: 'entry total height changed' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount next last item' }))

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(scrollToEnd).toHaveBeenCalledTimes(2)
        expect(onPositioned).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'next tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'next at bottom' }))
        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(onPositioned).toHaveBeenCalledTimes(1)
    })

    it('ignores an uncancelled retry from the previous conversation generation', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)
        vi.mocked(window.cancelAnimationFrame).mockImplementation(() => undefined)

        fireEvent.click(screen.getByRole('button', { name: /^position entry$/ }))
        fireEvent.click(screen.getByRole('button', { name: 'far range' }))
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'cancel entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'position next entry' }))

        act(() => {
            vi.advanceTimersByTime(1)
        })

        expect(scrollToEnd).toHaveBeenCalledTimes(3)
        expect(onPositioned).not.toHaveBeenCalled()
    })

    it('cancels old conversation work and resets list-scoped observations before the next conversation', () => {
        const onPositioned = vi.fn()
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="history" isStreamingOutput={false} onPositioned={onPositioned} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'position entry' }))
        fireEvent.click(screen.getByRole('button', { name: 'mount last item' }))
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))
        expect(screen.getByTestId('show-scroll-to-bottom').textContent).toBe('true')

        fireEvent.click(screen.getByRole('button', { name: 'cancel entry' }))
        expect(screen.getByTestId('show-scroll-to-bottom').textContent).toBe('false')

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(onPositioned).not.toHaveBeenCalled()
    })

    it('coalesces streaming content and total-height changes into one 64ms auto command', () => {
        const scrollToEnd = vi.fn()
        const page = render(<HookHarness contentSignal="token-1" isStreamingOutput scrollToEnd={scrollToEnd} />)

        act(() => {
            vi.advanceTimersByTime(64)
        })
        scrollToEnd.mockClear()

        page.rerender(<HookHarness contentSignal="token-2" isStreamingOutput scrollToEnd={scrollToEnd} />)
        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))

        act(() => {
            vi.advanceTimersByTime(63)
        })
        expect(scrollToEnd).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
        })
        expect(scrollToEnd).toHaveBeenCalledTimes(1)
        expect(scrollToEnd).toHaveBeenCalledWith('auto')
    })

    it('does not schedule follow from a static conversation height change while Virtuoso still reports at bottom', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="completed" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()
    })

    it('cancels a pending streaming follow when output becomes static', () => {
        const scrollToEnd = vi.fn()
        const page = render(<HookHarness contentSignal="final-token" isStreamingOutput scrollToEnd={scrollToEnd} />)

        page.rerender(<HookHarness contentSignal="final-token" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()
    })

    it.each([
        ['wheel up', (viewport: HTMLElement) => fireEvent.wheel(viewport, { deltaY: -20 })],
        [
            'touch upward through older content',
            (viewport: HTMLElement) => {
                fireEvent.touchStart(viewport, { touches: [{ clientY: 100 }] })
                fireEvent.touchMove(viewport, { touches: [{ clientY: 150 }] })
            },
        ],
        ['PageUp', (viewport: HTMLElement) => fireEvent.keyDown(viewport, { key: 'PageUp' })],
        ['Home', (viewport: HTMLElement) => fireEvent.keyDown(viewport, { key: 'Home' })],
        ['Shift+Space', (viewport: HTMLElement) => fireEvent.keyDown(viewport, { key: ' ', shiftKey: true })],
    ])('locks the current turn after %s until an explicit reset', (_label, signalIntent) => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="token" isStreamingOutput scrollToEnd={scrollToEnd} />)
        act(() => {
            vi.advanceTimersByTime(64)
        })
        scrollToEnd.mockClear()

        signalIntent(screen.getByTestId('message-viewport'))
        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        act(() => {
            vi.advanceTimersByTime(64)
        })
        expect(scrollToEnd).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'reset turn' }))
        expect(scrollToEnd).toHaveBeenCalledWith('auto')
    })

    it('does not pull a completed conversation back after a slight upward wheel within the bottom threshold', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="completed" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        fireEvent.wheel(screen.getByTestId('message-viewport'), { deltaY: -20 })
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()
    })

    it('locks a non-programmatic scrollbar drag away from the end', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="token" isStreamingOutput scrollToEnd={scrollToEnd} />)
        act(() => {
            vi.advanceTimersByTime(64)
            vi.advanceTimersByTime(32)
        })
        scrollToEnd.mockClear()

        fireEvent.click(screen.getByRole('button', { name: 'scrolling' }))
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))
        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()
    })

    it('uses smooth only for a nearby manual return and auto for a far return', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="reader" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)

        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))
        expect(screen.getByTestId('show-scroll-to-bottom').textContent).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'tail range' }))
        fireEvent.click(screen.getByRole('button', { name: 'restore' }))
        expect(scrollToEnd).toHaveBeenLastCalledWith('smooth')

        fireEvent.click(screen.getByRole('button', { name: 'far range' }))
        fireEvent.click(screen.getByRole('button', { name: 'restore' }))
        expect(scrollToEnd).toHaveBeenLastCalledWith('auto')

        fireEvent.click(screen.getByRole('button', { name: 'at bottom' }))
        expect(screen.getByTestId('show-scroll-to-bottom').textContent).toBe('false')
    })

    it('does not align a static conversation after a Composer height change while still at bottom', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="ready" isStreamingOutput={false} scrollToEnd={scrollToEnd} />)
        const composer = screen.getByTestId('composer-container')
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 120,
            height: 120,
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

        expect(screen.getByTestId('composer-overlay-inset').textContent).toBe('120')
        expect(scrollToEnd).not.toHaveBeenCalled()
    })

    it('commits Composer height before aligning a streaming reader and leaves a reader away from bottom alone', () => {
        const scrollToEnd = vi.fn()
        render(<HookHarness contentSignal="ready" isStreamingOutput scrollToEnd={scrollToEnd} />)
        const composer = screen.getByTestId('composer-container')
        vi.spyOn(composer, 'getBoundingClientRect').mockReturnValue({
            bottom: 120,
            height: 120,
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

        expect(screen.getByTestId('composer-overlay-inset').textContent).toBe('120')
        expect(scrollToEnd).toHaveBeenCalledWith('auto')
        act(() => {
            vi.advanceTimersByTime(64)
        })
        scrollToEnd.mockClear()

        fireEvent.wheel(screen.getByTestId('message-viewport'), { deltaY: -20 })
        fireEvent.click(screen.getByRole('button', { name: 'away from bottom' }))
        act(() => {
            ResizeObserverStub.trigger(composer)
        })
        fireEvent.click(screen.getByRole('button', { name: 'total height changed' }))
        act(() => {
            vi.advanceTimersByTime(64)
        })

        expect(scrollToEnd).not.toHaveBeenCalled()
    })
})
