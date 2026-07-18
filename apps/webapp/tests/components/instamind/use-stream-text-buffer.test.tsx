/** @vitest-environment jsdom */

import { act, render } from '@testing-library/react'
import { createRef, forwardRef, useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PendingTextDelta } from '@/components/instamind/chat-stream/stream-message-reducer'
import { useStreamTextBuffer } from '@/components/instamind/chat-stream/use-stream-text-buffer'

type StreamTextBufferHandle = ReturnType<typeof useStreamTextBuffer>

const StreamTextBufferHarness = forwardRef<StreamTextBufferHandle, { flushTextDeltas: (deltas: PendingTextDelta[]) => void }>(
    function StreamTextBufferHarness({ flushTextDeltas }, ref) {
        const buffer = useStreamTextBuffer({
            flushIntervalMs: 40,
            flushTextDeltas,
        })

        useImperativeHandle(ref, () => buffer, [buffer])

        return null
    }
)

beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
})

afterEach(() => {
    vi.useRealTimers()
})

describe('useStreamTextBuffer', () => {
    it('普通换行继续等待时间窗口合并，不触发提前刷新', () => {
        const flushTextDeltas = vi.fn()
        const ref = createRef<StreamTextBufferHandle>()

        render(<StreamTextBufferHarness ref={ref} flushTextDeltas={flushTextDeltas} />)

        act(() => {
            ref.current?.enqueue('message-1', 'part-1', 'text', '第一行\n')
            vi.advanceTimersByTime(39)
        })

        expect(flushTextDeltas).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(1)
            vi.runOnlyPendingTimers()
        })

        expect(flushTextDeltas).toHaveBeenCalledWith([
            {
                delta: '第一行\n',
                messageId: 'message-1',
                partId: 'part-1',
                partType: 'text',
            },
        ])
    })

    it('代码围栏仍在最近一帧提前刷新，避免块结构明显滞后', () => {
        const flushTextDeltas = vi.fn()
        const ref = createRef<StreamTextBufferHandle>()

        render(<StreamTextBufferHarness ref={ref} flushTextDeltas={flushTextDeltas} />)

        act(() => {
            ref.current?.enqueue('message-1', 'part-1', 'text', '```ts')
            vi.runOnlyPendingTimers()
        })

        expect(flushTextDeltas).toHaveBeenCalledTimes(1)
    })
})
