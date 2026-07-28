import { describe, expect, it } from 'vitest'

import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { type StreamEventRecord, StreamEventStore, type StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'

const ownerSessionHash = 'a'.repeat(64)
const runId = 'run_tasklist'
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

function createTasklistRun(): StreamRunRecord {
    return {
        agentRunId: runId,
        cancelRequestedAt: null,
        completedAt: null,
        createdAt: now,
        executionOwnerId: null,
        failureCode: null,
        id: runId,
        kind: 'tasklist_agent',
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

describe('AgentRun stream recovery integration', () => {
    it('projects HITL pause, resume continuation and terminal finish into one ordered StreamRun', async () => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set(runId, createTasklistRun())
        const { projector, store } = createProjector(fake)

        await projector.projectChunk({
            chunk: {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant_tasklist',
                interruptId: 'interrupt_strategy',
                interruptKind: 'strategy_review',
                payload: {
                    allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                    data: {
                        planUri: 'demo://version-plans/v0.4.10.md',
                        reviewRound: 1,
                        strategy: {
                            granularity: 'medium',
                            grouping: 'by_phase',
                            priorityFocus: ['core_runtime'],
                            stepCountRange: '5-8',
                        },
                    },
                    kind: 'strategy_review',
                    nodeName: 'reviewTasklistStrategy',
                    runId,
                    threadId: `tasklist-agent:c1:${runId}`,
                },
                runId,
                threadId: `tasklist-agent:c1:${runId}`,
                type: 'agent-interrupt',
            },
            ownerSessionHash,
            runId,
        })
        await projector.projectChunk({
            chunk: {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant_tasklist',
                interruptId: 'interrupt_strategy',
                runId,
                threadId: `tasklist-agent:c1:${runId}`,
                type: 'agent-resume',
            },
            ownerSessionHash,
            runId,
        })
        await projector.projectChunk({
            chunk: { type: 'finish' },
            ownerSessionHash,
            runId,
        })

        const replay = await store.replayEvents({ after: 0, now, ownerSessionHash, runId })

        expect(fake.runs.get(runId)).toMatchObject({
            agentRunId: runId,
            id: runId,
            kind: 'tasklist_agent',
            lastSequence: 3,
            status: 'completed',
            terminalSequence: 3,
        })
        expect(replay.events).toEqual([
            expect.objectContaining({ eventKind: 'lifecycle', runStatus: 'paused', sequence: 1 }),
            expect.objectContaining({ eventKind: 'lifecycle', runStatus: 'running', sequence: 2 }),
            expect.objectContaining({ eventKind: 'terminal', sequence: 3, terminalState: 'completed' }),
        ])
    })

    it('maps Agent runtime failure to failed terminal event and rejects raw GraphState payload leakage', async () => {
        const fake = new FakeStreamRecoveryPrisma()
        fake.runs.set(runId, createTasklistRun())
        const { projector } = createProjector(fake)

        await expect(
            projector.projectChunk({
                chunk: {
                    graphState: {
                        checkpoint: 'raw',
                    },
                    delta: 'leak',
                    partId: 'answer',
                    type: 'text-delta',
                } as never,
                ownerSessionHash,
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_EVENT_INVALID',
        })
        await expect(
            projector.projectChunk({
                chunk: {
                    errorCode: 'MODEL_STREAM_FAILED',
                    message: 'Tasklist Agent failed.',
                    retryable: false,
                    scope: 'runtime',
                    type: 'error',
                },
                ownerSessionHash,
                runId,
            })
        ).resolves.toMatchObject({
            eventKind: 'terminal',
            terminalState: 'failed',
        })
    })
})
