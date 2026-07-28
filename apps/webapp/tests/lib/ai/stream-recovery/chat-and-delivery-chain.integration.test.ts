import { describe, expect, it } from 'vitest'

import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { type StreamEventRecord, StreamEventStore, type StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'

const ownerSessionHash = 'a'.repeat(64)
const now = new Date('2026-07-21T10:00:00.000Z')
const retentionUntil = new Date('2026-07-21T10:10:00.000Z')

class FakeStreamRecoveryPrisma {
    runs = new Map<string, StreamRunRecord>()
    events: StreamEventRecord[] = []

    streamRun = {
        findUnique: async ({ where }: { where: { id: string } }) => this.runs.get(where.id) ?? null,
        update: async ({
            data,
            where,
        }: {
            where: { id: string }
            data: Partial<Pick<StreamRunRecord, 'completedAt' | 'lastSequence' | 'status' | 'terminalSequence'>>
        }) => {
            const run = this.runs.get(where.id)

            if (!run) {
                throw new Error(`Missing fake stream run ${where.id}`)
            }

            const updated = {
                ...run,
                ...data,
                updatedAt: now,
            }
            this.runs.set(where.id, updated)

            return updated
        },
    }

    streamEvent = {
        create: async ({ data }: { data: Omit<StreamEventRecord, 'createdAt'> }) => {
            const event = {
                ...data,
                createdAt: now,
            }
            this.events.push(event)

            return event
        },
        deleteMany: async () => ({ count: 0 }),
        findFirst: async ({ orderBy, where }: { where: { runId: string; terminal?: boolean }; orderBy: { sequence: 'asc' | 'desc' } }) => {
            const events = this.events
                .filter(event => event.runId === where.runId && (where.terminal === undefined || event.terminal === where.terminal))
                .sort((first, second) => (orderBy.sequence === 'asc' ? first.sequence - second.sequence : second.sequence - first.sequence))

            return events[0] ?? null
        },
        findMany: async ({ where }: { where: { runId: string; sequence?: { gt: number } }; orderBy: { sequence: 'asc' } }) =>
            this.events
                .filter(event => event.runId === where.runId && event.sequence > (where.sequence?.gt ?? 0))
                .sort((first, second) => first.sequence - second.sequence),
    }

    async $transaction<T>(callback: (transaction: this) => Promise<T>): Promise<T> {
        return callback(this)
    }
}

function createRun(id: string, kind: StreamRunRecord['kind']): StreamRunRecord {
    return {
        agentRunId: null,
        cancelRequestedAt: null,
        completedAt: null,
        createdAt: now,
        executionOwnerId: null,
        failureCode: null,
        id,
        kind,
        lastSequence: 0,
        maxEventPayloadBytes: 262_144,
        maxRetainedEvents: 20_000,
        ownerSessionHash,
        publicFailureMessage: null,
        retentionUntil,
        status: 'running',
        terminalSequence: null,
        updatedAt: now,
    }
}

function createProjector(fake: FakeStreamRecoveryPrisma) {
    let nextId = 1
    const store = new StreamEventStore(fake as never, {
        createEventId: () => `evt_${nextId++}`,
    })

    return {
        projector: new StreamEventProjector(store),
        store,
    }
}

describe('chat and delivery-chain stream recovery integration', () => {
    it('replays ordinary chat events after a controlled disconnect cursor and preserves terminal state', async () => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set('run_chat', createRun('run_chat', 'chat'))
        const { projector, store } = createProjector(fake)

        await projector.projectChunk({
            chunk: { type: 'start', messageId: 'assistant-chat' },
            ownerSessionHash,
            runId: 'run_chat',
        })
        await projector.projectChunk({
            chunk: { type: 'text-start', partId: 'text-chat' },
            ownerSessionHash,
            runId: 'run_chat',
        })
        await projector.projectChunk({
            chunk: { type: 'text-delta', partId: 'text-chat', delta: 'after disconnect' },
            ownerSessionHash,
            runId: 'run_chat',
        })
        await projector.projectChunk({
            chunk: { type: 'finish' },
            ownerSessionHash,
            runId: 'run_chat',
        })

        const replay = await store.replayEvents({ after: 1, now, ownerSessionHash, runId: 'run_chat' })

        expect(replay.events.map(event => event.sequence)).toEqual([2, 3, 4])
        expect(replay.events[1]).toMatchObject({
            payload: { delta: 'after disconnect', type: 'text-delta' },
        })
        expect(replay.events[2]).toMatchObject({
            eventKind: 'terminal',
            terminal: true,
            terminalState: 'completed',
        })
    })

    it('uses the same recovery contract for Delivery Chain workflow progress and terminal events', async () => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set('run_delivery', createRun('run_delivery', 'delivery_chain'))
        const { projector, store } = createProjector(fake)

        await projector.projectChunk({
            chunk: { type: 'start', messageId: 'assistant-delivery' },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: {
                partId: 'workflow-progress-part',
                title: '正在生成交付计划...',
                type: 'workflow-progress-start',
                workflowId: 'delivery-chain-run-1',
                workflowKind: 'delivery-chain',
            },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: {
                partId: 'workflow-progress-part',
                status: 'completed',
                stepId: 'plan',
                summary: '方案已生成',
                title: '方案规划',
                type: 'workflow-progress-step',
                workflowId: 'delivery-chain-run-1',
            },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: {
                partId: 'workflow-progress-part',
                status: 'completed',
                type: 'workflow-progress-end',
                workflowId: 'delivery-chain-run-1',
            },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: { type: 'text-start', partId: 'delivery-report' },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: {
                type: 'text-delta',
                partId: 'delivery-report',
                delta: '# Delivery Chain Report\n- task-subagent: 已完成\n- risk-subagent: 已完成\n- boundary-subagent: pass',
            },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: { type: 'text-end', partId: 'delivery-report' },
            ownerSessionHash,
            runId: 'run_delivery',
        })
        await projector.projectChunk({
            chunk: { type: 'finish' },
            ownerSessionHash,
            runId: 'run_delivery',
        })

        const replay = await store.replayEvents({ after: 2, now, ownerSessionHash, runId: 'run_delivery' })

        expect(fake.runs.get('run_delivery')).toMatchObject({
            kind: 'delivery_chain',
            status: 'completed',
            terminalSequence: 8,
        })
        expect(replay.events.map(event => event.sequence)).toEqual([3, 4, 5, 6, 7, 8])
        expect(replay.events[0]).toMatchObject({
            payload: {
                status: 'completed',
                type: 'workflow-progress-step',
            },
        })
        expect(replay.events[3]).toMatchObject({
            payload: {
                delta: '# Delivery Chain Report\n- task-subagent: 已完成\n- risk-subagent: 已完成\n- boundary-subagent: pass',
                type: 'text-delta',
            },
        })
        expect(replay.events[5]).toMatchObject({
            terminal: true,
            terminalState: 'completed',
        })
    })
})
