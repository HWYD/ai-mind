import { useEffect, useRef } from 'react'

import type { PendingTextDelta } from './stream-message-reducer'

/**
 * 文本增量 buffer 的配置。
 *
 * buffer 不直接修改 MindMessage，flush 时只把合并后的 delta 批量交回上层 reducer。
 * 这样“何时刷新”和“消息树怎么变”分开，避免 token 缓冲逻辑污染 stream chunk 映射规则。
 */
interface UseStreamTextBufferOptions {
    flushIntervalMs: number
    flushTextDeltas: (pendingTextDeltas: PendingTextDelta[]) => void
}

export function useStreamTextBuffer({ flushIntervalMs, flushTextDeltas }: UseStreamTextBufferOptions) {
    const pendingTextDeltasRef = useRef<Map<string, PendingTextDelta>>(new Map())
    const flushTimerRef = useRef<number | null>(null)
    const flushRafRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (flushTimerRef.current !== null) {
                window.clearTimeout(flushTimerRef.current)
            }

            if (flushRafRef.current !== null) {
                window.cancelAnimationFrame(flushRafRef.current)
            }
        }
    }, [])

    function clearScheduledFlushes() {
        if (flushTimerRef.current !== null) {
            window.clearTimeout(flushTimerRef.current)
            flushTimerRef.current = null
        }

        if (flushRafRef.current !== null) {
            window.cancelAnimationFrame(flushRafRef.current)
            flushRafRef.current = null
        }
    }

    /**
     * 把已合并的 pending delta 一次提交给 reducer。
     *
     * pending 已经按 messageId + partType + partId 合并；一次提交只触发一次消息树更新。
     */
    function flush() {
        clearScheduledFlushes()

        if (pendingTextDeltasRef.current.size === 0) {
            return
        }

        const pending = Array.from(pendingTextDeltasRef.current.values())
        pendingTextDeltasRef.current.clear()

        flushTextDeltas(pending)
    }

    function clear() {
        pendingTextDeltasRef.current.clear()
        clearScheduledFlushes()
    }

    function scheduleFlushByAnimationFrame() {
        if (flushRafRef.current !== null) {
            return
        }

        flushRafRef.current = window.requestAnimationFrame(() => {
            flushRafRef.current = null
            flush()
        })
    }

    function scheduleFlushByTimer() {
        if (flushTimerRef.current !== null) {
            return
        }

        // 时间窗口负责吞掉高频 token；真正写 state 放到 rAF，尽量贴近浏览器下一次绘制。
        flushTimerRef.current = window.setTimeout(() => {
            flushTimerRef.current = null
            scheduleFlushByAnimationFrame()
        }, flushIntervalMs)
    }

    /**
     * 入队单个 text/reasoning delta。
     *
     * 同一个 message/part/type 的连续 token 会合并成一条 delta，减少 Markdown 解析和 React 渲染压力。
     */
    function enqueue(messageId: string, partId: string, partType: 'text' | 'reasoning', delta: string) {
        if (!delta) {
            return
        }

        const pendingKey = `${messageId}:${partType}:${partId}`
        const existing = pendingTextDeltasRef.current.get(pendingKey)

        if (existing) {
            existing.delta += delta
        } else {
            pendingTextDeltasRef.current.set(pendingKey, {
                messageId,
                partId,
                partType,
                delta,
            })
        }

        scheduleFlushByTimer()

        if (delta.includes('```')) {
            // 代码围栏会改变 Markdown 块结构，提前到最近一帧 flush；普通换行继续交给时间窗口合并。
            scheduleFlushByAnimationFrame()
        }
    }

    return {
        clear,
        enqueue,
        flush,
    }
}
