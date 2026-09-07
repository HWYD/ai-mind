import { describe, expect, it, vi } from 'vitest'

import type { ContextBudget } from '@/lib/ai/model-provider'
import { createChatMemoryService, type ThreadMemoryStatusEvent } from '@/lib/ai/runtime/chat-memory'

const budget: ContextBudget = {
    compactionTriggerTokens: 320,
    effectiveWindowTokens: 1_000,
    hardInputTokens: 900,
    maxOutputTokens: 100,
    operationalCapTokens: 1_000,
    physicalWindowTokens: 1_000,
    postCompactionTargetTokens: 180,
    runtimeReserveTokens: 100,
}

function createOversizedState() {
    return {
        messages: Array.from({ length: 6 }, (_, index) => ({
            createdAt: new Date(index).toISOString(),
            id: `message-${index}`,
            role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
            text: `message ${index} ${'token '.repeat(80)}`,
        })),
        pinnedDecisions: [],
        summary: '',
    }
}

function statusRecorder() {
    const events: ThreadMemoryStatusEvent[] = []

    return {
        events,
        onStatus: (event: ThreadMemoryStatusEvent) => events.push(event),
    }
}

describe('runtime/chat-memory status lifecycle', () => {
    it('successful persistent compaction ends started status with succeeded', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({ pinnedDecisions: [], summary: 'compacted summary' }),
            }
        )
        const threadId = 'chat:' + 'a'.repeat(64)
        const recorder = statusRecorder()
        await service.writeThreadState(threadId, createOversizedState())

        await service.compactThreadState(threadId, budget, { onStatus: recorder.onStatus })

        expect(recorder.events.map(event => event.status)).toEqual(['started', 'succeeded'])
    })

    it('generator failure ends started status with failed', async () => {
        const compactionGenerator = async () => {
            throw new Error('generator unavailable')
        }
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {}, { compactionGenerator })
        const threadId = 'chat:' + 'b'.repeat(64)
        const recorder = statusRecorder()
        await service.writeThreadState(threadId, createOversizedState())

        await service.compactThreadState(threadId, budget, { onStatus: recorder.onStatus })

        expect(recorder.events.map(event => event.status)).toEqual(['started', 'failed'])
    })

    it('cancellation passes the signal to compaction and rethrows AbortError without writing a checkpoint', async () => {
        const abortController = new AbortController()
        let receivedSignal: AbortSignal | undefined
        const compactionGenerator = async (_input: unknown, execution?: { signal?: AbortSignal }) => {
            receivedSignal = execution?.signal
            throw new DOMException('request cancelled', 'AbortError')
        }
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {}, { compactionGenerator })
        const threadId = 'chat:' + 'd'.repeat(64)
        const recorder = statusRecorder()
        const originalState = createOversizedState()
        await service.writeThreadState(threadId, originalState)
        const persistedStateBeforeCancellation = (await service.readThreadState(threadId)).state

        await expect(
            service.compactThreadState(threadId, budget, {
                onStatus: recorder.onStatus,
                signal: abortController.signal,
            })
        ).rejects.toMatchObject({ name: 'AbortError' })

        expect(receivedSignal).toBe(abortController.signal)
        expect((await service.readThreadState(threadId)).state).toEqual(persistedStateBeforeCancellation)
        expect(recorder.events.map(event => event.status)).toEqual(['started', 'failed'])
    })

    it('signal cancellation normalizes a provider error to AbortError without fallback state changes', async () => {
        const abortController = new AbortController()
        const compactionGenerator = async () => {
            abortController.abort()
            throw new Error('provider transport closed')
        }
        const service = createChatMemoryService({ checkpointMode: 'memory' }, {}, { compactionGenerator })
        const threadId = 'chat:' + 'e'.repeat(64)
        const recorder = statusRecorder()
        await service.writeThreadState(threadId, createOversizedState())
        const persistedStateBeforeCancellation = (await service.readThreadState(threadId)).state

        await expect(
            service.compactThreadState(threadId, budget, {
                onStatus: recorder.onStatus,
                signal: abortController.signal,
            })
        ).rejects.toMatchObject({ name: 'AbortError' })

        expect((await service.readThreadState(threadId)).state).toEqual(persistedStateBeforeCancellation)
        expect(recorder.events.map(event => event.status)).toEqual(['started', 'failed'])
    })

    it('candidate checkpoint write failure ends started status with failed before the error is delegated to ephemeral fit', async () => {
        const service = createChatMemoryService(
            { checkpointMode: 'memory' },
            {},
            {
                compactionGenerator: async () => ({ pinnedDecisions: [], summary: 'compacted summary' }),
            }
        )
        const threadId = 'chat:' + 'c'.repeat(64)
        const recorder = statusRecorder()
        await service.writeThreadState(threadId, createOversizedState())
        vi.spyOn(service, 'writeThreadState').mockRejectedValueOnce(new Error('checkpoint unavailable'))

        await expect(service.compactThreadState(threadId, budget, { onStatus: recorder.onStatus })).rejects.toThrow(
            'checkpoint unavailable'
        )

        expect(recorder.events.map(event => event.status)).toEqual(['started', 'failed'])
    })
})
