import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    DurableStreamProjectionBuffer,
    DurableStreamProjectionBufferError,
} from '@/lib/ai/stream-recovery/durable-stream-projection-buffer'
import type { AppendStreamEventInput } from '@/lib/ai/stream-recovery/stream-event-store'

const ownerSessionHash = 'a'.repeat(64)
const runId = '11111111-1111-4111-8111-111111111111'

function textDelta(delta: string, partId = 'answer'): AppendStreamEventInput {
    return {
        eventKind: 'chunk',
        ownerSessionHash,
        payload: { delta, partId, type: 'text-delta' },
        runId,
    }
}

function structural(type: 'text-start' | 'text-end', partId = 'answer'): AppendStreamEventInput {
    return {
        eventKind: 'chunk',
        ownerSessionHash,
        payload: { partId, type },
        runId,
    }
}

function createHarness() {
    let sequence = 0
    const order: string[] = []
    const appendEvents = vi.fn(async (inputs: readonly AppendStreamEventInput[]) => {
        order.push(`persist:${inputs.map(input => input.payload.type).join(',')}`)
        return inputs.map(input => ({
            eventId: `evt_${++sequence}`,
            eventKind: input.eventKind,
            payload: input.payload,
            protocolVersion: 1 as const,
            runId: input.runId,
            sequence,
        }))
    })
    const publishCommitted = vi.fn(async (event: { sequence: number }) => {
        order.push(`publish:${event.sequence}`)
    })

    return {
        appendEvents,
        buffer: new DurableStreamProjectionBuffer({ appendEvents, publishCommitted }),
        order,
        publishCommitted,
    }
}

describe('durable-stream-projection-buffer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('每个 part 的首个 text delta 立即持久化后再投递', async () => {
        const { appendEvents, buffer, order } = createHarness()

        await buffer.publish(textDelta('首字'))

        expect(appendEvents).toHaveBeenCalledTimes(1)
        expect(appendEvents.mock.calls[0]?.[0]).toMatchObject([{ payload: { delta: '首字', type: 'text-delta' } }])
        expect(order).toEqual(['persist:text-delta', 'publish:1'])
    })

    it('后续同 part delta 合并到 40ms 后 flush', async () => {
        const { appendEvents, buffer } = createHarness()
        await buffer.publish(textDelta('first'))

        await buffer.publish(textDelta('a'))
        await buffer.publish(textDelta('b'))
        await vi.advanceTimersByTimeAsync(39)
        expect(appendEvents).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1)
        expect(appendEvents).toHaveBeenCalledTimes(2)
        expect(appendEvents.mock.calls[1]?.[0]).toMatchObject([{ payload: { delta: 'ab', type: 'text-delta' } }])
    })

    it('后续 delta 累计到 256 chars 时立即 flush，且不拆分大 delta', async () => {
        const { appendEvents, buffer } = createHarness()
        await buffer.publish(textDelta('first'))

        await buffer.publish(textDelta('a'.repeat(128)))
        await buffer.publish(textDelta('b'.repeat(128)))
        expect(appendEvents).toHaveBeenCalledTimes(2)
        expect(appendEvents.mock.calls[1]?.[0][0]?.payload).toMatchObject({ delta: `${'a'.repeat(128)}${'b'.repeat(128)}` })

        await buffer.publish(textDelta('c'.repeat(300)))
        expect(appendEvents).toHaveBeenCalledTimes(3)
        expect(appendEvents.mock.calls[2]?.[0][0]?.payload).toMatchObject({ delta: 'c'.repeat(300) })
    })

    it('结构化事件先 flush 更早文本，并在同一批次保留独立顺序', async () => {
        const { appendEvents, buffer, publishCommitted } = createHarness()
        await buffer.publish(textDelta('first'))
        await buffer.publish(textDelta('pending'))

        await buffer.publish(structural('text-end'))

        expect(appendEvents.mock.calls[1]?.[0]).toMatchObject([
            { payload: { delta: 'pending', type: 'text-delta' } },
            { payload: { type: 'text-end' } },
        ])
        expect(publishCommitted.mock.calls.map(call => call[0].sequence)).toEqual([1, 2, 3])
    })

    it('64-item 高水位阻塞 producer，直到同时低于 32 items/128KiB', async () => {
        const resolvers: Array<() => void> = []
        let sequence = 0
        const appendEvents = vi.fn(
            (inputs: readonly AppendStreamEventInput[]) =>
                new Promise<Array<Record<string, unknown>>>(resolve => {
                    resolvers.push(() =>
                        resolve(
                            inputs.map(input => ({
                                eventId: `evt_${++sequence}`,
                                eventKind: input.eventKind,
                                payload: input.payload,
                                protocolVersion: 1,
                                runId,
                                sequence,
                            }))
                        )
                    )
                })
        )
        const buffer = new DurableStreamProjectionBuffer({ appendEvents: appendEvents as never, publishCommitted: vi.fn() })

        const publications = Array.from({ length: 65 }, (_, index) => buffer.publish(structural('text-start', `part-${index}`)))
        let lastSettled = false
        void publications.at(-1)?.then(() => {
            lastSettled = true
        })
        await vi.advanceTimersByTimeAsync(0)
        expect(lastSettled).toBe(false)

        resolvers.shift()?.()
        await vi.advanceTimersByTimeAsync(0)
        expect(lastSettled).toBe(false)

        resolvers.shift()?.()
        await Promise.all(publications)
        expect(lastSettled).toBe(true)
        expect(appendEvents).toHaveBeenCalledTimes(2)
    })

    it('256KiB 高水位在接纳下一项前施加背压，并在低于 128KiB 后恢复', async () => {
        const resolvers: Array<() => void> = []
        let sequence = 0
        const appendEvents = vi.fn(
            (inputs: readonly AppendStreamEventInput[]) =>
                new Promise<Array<Record<string, unknown>>>(resolve => {
                    resolvers.push(() =>
                        resolve(
                            inputs.map(input => ({
                                eventId: `evt_${++sequence}`,
                                eventKind: input.eventKind,
                                payload: input.payload,
                                protocolVersion: 1,
                                runId,
                                sequence,
                            }))
                        )
                    )
                })
        )
        const buffer = new DurableStreamProjectionBuffer({ appendEvents: appendEvents as never, publishCommitted: vi.fn() })
        const first = buffer.publish(textDelta('a'.repeat(140 * 1024)))
        const second = buffer.publish(textDelta('b'.repeat(140 * 1024), 'answer-2'))
        let secondSettled = false
        void second.then(() => {
            secondSettled = true
        })

        await vi.advanceTimersByTimeAsync(0)
        expect(secondSettled).toBe(false)
        resolvers.shift()?.()
        await first
        await vi.advanceTimersByTimeAsync(0)
        resolvers.shift()?.()
        await second
        expect(secondSettled).toBe(true)
    })

    it('取消会清理 timer、唤醒背压等待者并拒绝后续 publish', async () => {
        const controller = new AbortController()
        let sequence = 0
        const cancellable = new DurableStreamProjectionBuffer({
            appendEvents: async inputs =>
                inputs.map(input => ({
                    eventId: `evt_${++sequence}`,
                    eventKind: input.eventKind,
                    payload: input.payload,
                    protocolVersion: 1,
                    runId,
                    sequence,
                })),
            publishCommitted: vi.fn(),
            signal: controller.signal,
        })

        await cancellable.publish(textDelta('first'))
        await cancellable.publish(textDelta('pending'))
        controller.abort()

        await expect(cancellable.drain()).rejects.toBeInstanceOf(DurableStreamProjectionBufferError)
        await expect(cancellable.publish(textDelta('late'))).rejects.toMatchObject({ code: 'PROJECTION_ABORTED' })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('持久化失败会固定失败、停止新事件并清理定时器', async () => {
        const buffer = new DurableStreamProjectionBuffer({
            appendEvents: vi.fn(async () => {
                throw new Error('database unavailable')
            }),
            publishCommitted: vi.fn(),
        })

        await expect(buffer.publish(textDelta('first'))).rejects.toMatchObject({ code: 'PROJECTION_FAILED' })
        await expect(buffer.publish(textDelta('late'))).rejects.toMatchObject({ code: 'PROJECTION_FAILED' })
        expect(vi.getTimerCount()).toBe(0)
    })

    it('terminal 一经接纳即原子封口，拒绝同 tick 到达的后续事件', async () => {
        const { buffer } = createHarness()
        const terminal = buffer.publish({
            eventKind: 'terminal',
            ownerSessionHash,
            payload: { type: 'finish' },
            runId,
            terminalState: 'completed',
        })

        await expect(buffer.publish(structural('text-start', 'late'))).rejects.toMatchObject({ code: 'PROJECTION_CLOSED' })
        await terminal
    })

    it('在途 flush 在 fail() 后完成不会把 pending 计数扣成负数', async () => {
        const controller = new AbortController()
        let resolveAppend: ((result: Array<Record<string, unknown>>) => void) | undefined
        const appendEvents = vi.fn(
            () =>
                new Promise<Array<Record<string, unknown>>>(resolve => {
                    resolveAppend = resolve
                })
        )
        const buffer = new DurableStreamProjectionBuffer({
            appendEvents: appendEvents as never,
            publishCommitted: vi.fn(),
            signal: controller.signal,
        })

        const flush = buffer.publish(textDelta('first'))
        await vi.advanceTimersByTimeAsync(0)
        expect(appendEvents).toHaveBeenCalledTimes(1)

        controller.abort()
        resolveAppend?.([
            {
                eventId: 'evt_1',
                eventKind: 'chunk',
                payload: { delta: 'first', partId: 'answer', type: 'text-delta' },
                protocolVersion: 1,
                runId,
                sequence: 1,
            },
        ])

        await expect(flush).resolves.toBeUndefined()

        const counters = buffer as unknown as { pendingBytes: number; pendingItems: number }
        expect(counters.pendingItems).toBe(0)
        expect(counters.pendingBytes).toBe(0)
    })
})
