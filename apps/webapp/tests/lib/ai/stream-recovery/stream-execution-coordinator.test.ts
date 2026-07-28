import { beforeEach, describe, expect, it } from 'vitest'

import type { StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamExecutionCoordinator, type StreamExecutionRepository } from '@/lib/ai/stream-recovery/stream-execution-coordinator'

const ownerSessionHash = 'a'.repeat(64)
const runId = 'run_1'
const now = new Date('2026-07-21T10:00:00.000Z')

class FakeExecutionRepository implements StreamExecutionRepository {
    run: StreamRunRecord = {
        agentRunId: null,
        cancelRequestedAt: null,
        completedAt: null,
        createdAt: now,
        executionOwnerId: null,
        failureCode: null,
        id: runId,
        kind: 'chat',
        lastSequence: 0,
        maxEventPayloadBytes: 262_144,
        maxRetainedEvents: 20_000,
        ownerSessionHash,
        publicFailureMessage: null,
        retentionUntil: new Date('2026-07-21T10:10:00.000Z'),
        status: 'running',
        terminalSequence: null,
        updatedAt: now,
    }

    async claimExecution(input: { runId: string; ownerSessionHash: string; executionOwnerId: string }) {
        if (input.runId !== this.run.id) {
            throw new Error('missing run')
        }

        if (input.ownerSessionHash !== this.run.ownerSessionHash) {
            throw new Error('forbidden')
        }

        if (this.run.executionOwnerId) {
            const error = new Error('already active') as Error & { code: string }
            error.code = 'STREAM_EXECUTION_ALREADY_ACTIVE'
            throw error
        }

        this.run = {
            ...this.run,
            executionOwnerId: input.executionOwnerId,
        }

        return this.run
    }

    async clearExecutionOwner(input: { runId: string; executionOwnerId: string }) {
        if (input.runId === this.run.id && input.executionOwnerId === this.run.executionOwnerId) {
            this.run = {
                ...this.run,
                executionOwnerId: null,
            }
        }
    }

    async getCancelRequestedAt() {
        return this.run.cancelRequestedAt
    }

    async markCancelRequested(input: { runId: string; ownerSessionHash: string; now: Date }) {
        if (input.runId !== this.run.id) {
            throw new Error('missing run')
        }

        if (input.ownerSessionHash !== this.run.ownerSessionHash) {
            throw new Error('forbidden')
        }

        this.run = {
            ...this.run,
            cancelRequestedAt: input.now,
        }

        return this.run
    }
}

describe('stream-execution-coordinator', () => {
    let repository: FakeExecutionRepository
    let coordinator: StreamExecutionCoordinator
    let nextOwnerId: number

    beforeEach(() => {
        repository = new FakeExecutionRepository()
        nextOwnerId = 1
        coordinator = new StreamExecutionCoordinator(repository, () => `owner_${nextOwnerId++}`)
    })

    it('decouples request.signal abort from the run-scoped execution signal', async () => {
        const requestController = new AbortController()
        const result = await coordinator.startExecution({
            execute: async context => {
                requestController.abort()
                await Promise.resolve()

                expect(context.executionOwnerId).toBe('owner_1')
                expect(context.signal.aborted).toBe(false)

                return 'completed'
            },
            ownerSessionHash,
            requestSignal: requestController.signal,
            runId,
        })

        expect(result).toBe('completed')
        expect(repository.run.executionOwnerId).toBeNull()
    })

    it('starts the run even when the transport was already disconnected', async () => {
        const requestController = new AbortController()
        requestController.abort()

        await expect(
            coordinator.startExecution({
                execute: async context => context.signal.aborted,
                ownerSessionHash,
                requestSignal: requestController.signal,
                runId,
            })
        ).resolves.toBe(false)
    })

    it('aborts the active run-scoped signal when explicit cancel is requested', async () => {
        let markExecutionStarted: (() => void) | undefined
        const executionStarted = new Promise<void>(resolve => {
            markExecutionStarted = resolve
        })
        const execution = coordinator.startExecution({
            execute: context =>
                new Promise(resolve => {
                    context.signal.addEventListener('abort', () => resolve('aborted'))
                    markExecutionStarted?.()
                }),
            ownerSessionHash,
            runId,
        })
        await executionStarted

        await expect(coordinator.requestCancel({ now, ownerSessionHash, runId })).resolves.toMatchObject({
            cancelRequestedAt: now,
        })
        await expect(execution).resolves.toBe('aborted')
        expect(repository.run.executionOwnerId).toBeNull()
    })

    it('rejects a second executor for the same active run', async () => {
        const firstExecution = coordinator.startExecution({
            execute: () => new Promise(resolve => setTimeout(resolve, 10)),
            ownerSessionHash,
            runId,
        })
        await Promise.resolve()

        await expect(
            coordinator.startExecution({
                execute: async () => 'second',
                ownerSessionHash,
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_EXECUTION_ALREADY_ACTIVE',
        })

        await coordinator.requestCancel({ now, ownerSessionHash, runId })
        await firstExecution
    })

    it('does not take over a run that already has an execution owner', async () => {
        repository.run = {
            ...repository.run,
            executionOwnerId: 'other-process',
        }

        await expect(
            coordinator.startExecution({
                execute: async () => 'should-not-run',
                ownerSessionHash,
                runId,
            })
        ).rejects.toMatchObject({
            code: 'STREAM_EXECUTION_ALREADY_ACTIVE',
        })
    })

    it('passes a cancelled run-scoped signal when durable cancel intent already exists', async () => {
        repository.run = {
            ...repository.run,
            cancelRequestedAt: now,
        }

        await expect(
            coordinator.startExecution({
                execute: async context => context.signal.aborted,
                ownerSessionHash,
                runId,
            })
        ).resolves.toBe(true)
    })
})
