import { useEffect, useRef } from 'react'

import type { MindMessage } from '@/lib/ai/types/message'

import { appendTextualPartDelta } from './message-operations'

interface PendingTextDelta {
    messageId: string
    partId: string
    partType: 'text' | 'reasoning'
    delta: string
}

interface UseStreamTextBufferOptions {
    flushIntervalMs: number
    updateMessages: (updater: (current: MindMessage[]) => MindMessage[]) => void
}

export function useStreamTextBuffer({ flushIntervalMs, updateMessages }: UseStreamTextBufferOptions) {
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

    function flush() {
        clearScheduledFlushes()

        if (pendingTextDeltasRef.current.size === 0) {
            return
        }

        const pending = Array.from(pendingTextDeltasRef.current.values())
        pendingTextDeltasRef.current.clear()

        // 一次 flush 只触发一次 setMessages，把多个 part 的文本增量合并进同一棵消息树。
        updateMessages(current =>
            pending.reduce(
                (nextMessages, deltaItem) =>
                    appendTextualPartDelta(nextMessages, deltaItem.messageId, deltaItem.partId, deltaItem.partType, deltaItem.delta),
                current
            )
        )
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

        if (delta.includes('\n') || delta.includes('```')) {
            // 换行和代码块会影响 Markdown 结构，提前到最近一帧 flush，让结构成型不要明显滞后。
            scheduleFlushByAnimationFrame()
        }
    }

    return {
        clear,
        enqueue,
        flush,
    }
}
