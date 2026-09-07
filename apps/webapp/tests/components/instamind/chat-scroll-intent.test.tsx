/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useChatScrollPolicy } from '@/components/instamind/use-chat-scroll-policy'

beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        }
    )
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 16))
    vi.stubGlobal('cancelAnimationFrame', window.clearTimeout)
})
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

function setup({ messageCount = 2 }: { messageCount?: number } = {}) {
    const scrollToEnd = vi.fn()
    const listRef = { current: { scrollToEnd } }
    const viewport = document.createElement('div')
    Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1600 },
    })
    const hook = renderHook(
        ({ streaming, key, accepted }) =>
            useChatScrollPolicy({
                contentSignal: streaming,
                isStreamingOutput: streaming,
                listRef,
                messageCount,
                scrollViewportElement: viewport,
                presentationKey: key,
                acceptedTurnRevision: accepted,
            }),
        { initialProps: { streaming: true, key: 'a', accepted: 0 } }
    )
    const grow = () =>
        act(() => {
            hook.result.current.onAtBottomChange(false)
            hook.result.current.onTotalHeightChange(1600)
            vi.advanceTimersByTime(100)
        })
    return { ...hook, viewport, scrollToEnd, grow }
}

it('follows delayed layout after finish without a terminal window and coalesces events', () => {
    const { result, rerender, scrollToEnd, grow } = setup()
    grow()
    expect(scrollToEnd).toHaveBeenCalledTimes(1)
    rerender({ streaming: false, key: 'a', accepted: 0 })
    act(() => {
        result.current.onAtBottomChange(true)
        vi.advanceTimersByTime(2000)
    })
    scrollToEnd.mockClear()
    grow()
    expect(scrollToEnd).toHaveBeenCalledTimes(1)
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('waits for Virtuoso measurement after a content-only render instead of issuing a second follow command', () => {
    const { result, rerender, scrollToEnd } = setup()

    act(() => {
        result.current.onAtBottomChange(false)
        vi.advanceTimersByTime(100)
    })
    scrollToEnd.mockClear()

    rerender({ streaming: false, key: 'a', accepted: 0 })
    act(() => vi.advanceTimersByTime(100))
    expect(scrollToEnd).not.toHaveBeenCalled()

    act(() => {
        result.current.onTotalHeightChange(1800)
        vi.advanceTimersByTime(100)
    })
    expect(scrollToEnd).toHaveBeenCalledOnce()
})

it('follows a measured height increase before the at-bottom callback catches up', async () => {
    const { result, scrollToEnd } = setup()

    act(() => result.current.onTotalHeightChange(1600))
    act(() => {
        result.current.onTotalHeightChange(1684)
        result.current.onTotalHeightChange(1768)
        vi.advanceTimersByTime(100)
    })
    // 增长改由微任务同帧合并到底，需刷新一次微任务队列后再断言。
    await act(async () => {})

    expect(scrollToEnd).toHaveBeenCalledOnce()
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('does not force a measured height increase after reading begins', () => {
    const { result, scrollToEnd } = setup()

    act(() => {
        result.current.onTotalHeightChange(1600)
        result.current.lockFollowForReader()
        result.current.onTotalHeightChange(1684)
        vi.advanceTimersByTime(100)
    })

    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('resets the measured height baseline when the presentation changes', () => {
    const { result, rerender, scrollToEnd } = setup()

    act(() => result.current.onTotalHeightChange(1600))
    act(() => {
        result.current.onTotalHeightChange(1600)
        vi.advanceTimersByTime(100)
    })
    expect(scrollToEnd).not.toHaveBeenCalled()

    rerender({ streaming: true, key: 'b', accepted: 0 })
    act(() => {
        result.current.onTotalHeightChange(3200)
        vi.advanceTimersByTime(100)
    })
    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('does not issue a follow command for measured growth without messages', () => {
    const { result, scrollToEnd } = setup({ messageCount: 0 })

    act(() => {
        result.current.onTotalHeightChange(1600)
        result.current.onTotalHeightChange(1684)
        vi.advanceTimersByTime(100)
    })

    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('does not add a follow command while entry positioning is pending', () => {
    const { result, scrollToEnd } = setup()
    const scope = { conversationId: 'conversation-a', sequence: 1 }

    act(() => {
        result.current.positionConversationEntryAtBottom({ ...scope, lastMessageIndex: 1 })
        vi.advanceTimersByTime(100)
    })
    scrollToEnd.mockClear()

    act(() => {
        result.current.onTotalHeightChange(1600, scope)
        result.current.onTotalHeightChange(1684, scope)
        vi.advanceTimersByTime(100)
    })

    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('keeps accepted turns and later measurements on the single follow-to-end path', () => {
    const { result, rerender, scrollToEnd } = setup()

    rerender({ streaming: true, key: 'a', accepted: 1 })
    act(() => vi.advanceTimersByTime(100))

    expect(scrollToEnd).toHaveBeenCalledOnce()
    expect(scrollToEnd).toHaveBeenLastCalledWith('auto')

    act(() => {
        result.current.onAtBottomChange(false)
        result.current.onTotalHeightChange(1800)
        vi.advanceTimersByTime(100)
    })

    expect(scrollToEnd).toHaveBeenCalledTimes(2)
    expect(scrollToEnd).toHaveBeenLastCalledWith('auto')
})

it.each([true, false])('keeps the button hidden through following geometry changes (streaming=%s)', streaming => {
    const { result, rerender, scrollToEnd } = setup()
    rerender({ streaming, key: 'a', accepted: 0 })
    for (let cycle = 0; cycle < 3; cycle++) {
        act(() => result.current.onAtBottomChange(false))
        expect(result.current.showScrollToBottom).toBe(false)
        act(() => vi.advanceTimersByTime(100))
        expect(result.current.showScrollToBottom).toBe(false)
        act(() => result.current.onAtBottomChange(true))
        expect(result.current.showScrollToBottom).toBe(false)
    }
    expect(scrollToEnd).toHaveBeenCalledTimes(3)
})

it('shows the button when reading begins during an already observed bottom gap', () => {
    const { result, grow, scrollToEnd } = setup()
    act(() => result.current.onAtBottomChange(false))
    act(() => result.current.lockFollowForReader())
    expect(result.current.showScrollToBottom).toBe(true)
    grow()
    expect(result.current.showScrollToBottom).toBe(true)
    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('hides after confirming an explicit return and stays hidden through subsequent increments', () => {
    const { result, grow } = setup()
    act(() => result.current.lockFollowForReader())
    grow()
    expect(result.current.showScrollToBottom).toBe(true)
    act(() => result.current.restoreFollowAndScrollToEnd())
    grow()
    expect(result.current.showScrollToBottom).toBe(true)
    act(() => result.current.onAtBottomChange(true))
    expect(result.current.showScrollToBottom).toBe(false)
    grow()
    expect(result.current.showScrollToBottom).toBe(false)
    act(() => result.current.lockFollowForReader())
    expect(result.current.showScrollToBottom).toBe(true)
})

it.each(['wheel', 'ArrowUp', 'PageUp', 'Home', 'touch', 'disclosure'])('cancels queued work on %s reading intent', input => {
    const { result, viewport, scrollToEnd, grow } = setup()
    act(() => {
        result.current.onAtBottomChange(false)
        if (input === 'wheel') viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }))
        else if (input === 'touch') {
            const start = new Event('touchstart')
            Object.defineProperty(start, 'touches', { value: [{ clientY: 50 }] })
            viewport.dispatchEvent(start)
            const move = new Event('touchmove')
            Object.defineProperty(move, 'touches', { value: [{ clientY: 100 }] })
            viewport.dispatchEvent(move)
        } else if (input === 'disclosure') result.current.lockFollowForReader()
        else viewport.dispatchEvent(new KeyboardEvent('keydown', { key: input }))
        vi.advanceTimersByTime(100)
    })
    grow()
    expect(scrollToEnd).not.toHaveBeenCalled()
    act(() => {
        result.current.restoreFollowAndScrollToEnd()
        vi.advanceTimersByTime(100)
    })
    expect(scrollToEnd).toHaveBeenCalledOnce()
    grow()
    expect(scrollToEnd).toHaveBeenCalledTimes(2)
})

it('does not recover reading from bottom geometry, status or rejected submissions', () => {
    const { result, rerender, scrollToEnd, grow } = setup()
    act(() => {
        result.current.lockFollowForReader()
        result.current.onAtBottomChange(true)
    })
    rerender({ streaming: false, key: 'a', accepted: 0 })
    grow()
    expect(scrollToEnd).not.toHaveBeenCalled()
    rerender({ streaming: true, key: 'a', accepted: 1 })
    act(() => vi.advanceTimersByTime(100))
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('resumes only after downward user movement actually reaches the bottom', () => {
    const { result, viewport, scrollToEnd, grow } = setup()
    act(() => result.current.lockFollowForReader())
    act(() => {
        viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }))
        result.current.onAtBottomChange(true)
    })
    grow()
    expect(scrollToEnd).not.toHaveBeenCalled()
    act(() => {
        viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: 500 }))
        viewport.scrollTop = 1200
        viewport.dispatchEvent(new Event('scroll'))
    })
    grow()
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('cancels previous presentation commands and ignores its late layout observations', () => {
    const { result, rerender, scrollToEnd } = setup()
    act(() => result.current.onAtBottomChange(false))
    rerender({ streaming: false, key: 'b', accepted: 0 })
    act(() => {
        result.current.onAtBottomChange(false, { conversationId: 'a', sequence: 0 })
        result.current.onTotalHeightChange(3000, { conversationId: 'a', sequence: 0 })
        vi.advanceTimersByTime(100)
    })
    expect(scrollToEnd).not.toHaveBeenCalled()
})

it('keeps downward intent through intermediate End scroll frames', () => {
    const { result, viewport, scrollToEnd, grow } = setup()
    act(() => result.current.lockFollowForReader())
    grow()
    expect(result.current.showScrollToBottom).toBe(true)
    act(() => {
        viewport.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
        viewport.scrollTop = 300
        viewport.dispatchEvent(new Event('scroll'))
        viewport.scrollTop = 1200
        viewport.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.showScrollToBottom).toBe(false)
    grow()
    expect(result.current.showScrollToBottom).toBe(false)
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('does not lock the conversation when a nested scrollable consumes wheel up', () => {
    const { viewport, scrollToEnd, grow } = setup()
    const inner = document.createElement('pre')
    inner.style.overflowY = 'auto'
    Object.defineProperties(inner, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } })
    inner.scrollTop = 100
    viewport.append(inner)
    act(() => inner.dispatchEvent(new WheelEvent('wheel', { deltaY: -30, bubbles: true })))
    grow()
    expect(scrollToEnd).toHaveBeenCalledWith('auto')
})

it('keeps the button until geometry confirms bottom and cancels on unmount', () => {
    const { result, scrollToEnd, unmount } = setup()
    act(() => {
        result.current.lockFollowForReader()
        result.current.onAtBottomChange(false)
    })
    expect(result.current.showScrollToBottom).toBe(true)
    act(() => result.current.restoreFollowAndScrollToEnd())
    expect(result.current.showScrollToBottom).toBe(true)
    unmount()
    act(() => vi.advanceTimersByTime(100))
    expect(scrollToEnd).not.toHaveBeenCalled()
})
