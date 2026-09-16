import { beforeEach, describe, expect, it, vi } from 'vitest'

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

    it('clears the cancel poller and execution owner after projection-side failure', async () => {
        vi.useFakeTimers()
        try {
            await expect(
                coordinator.startExecution({
                    execute: async () => {
                        throw new Error('projection failed')
                    },
                    ownerSessionHash,
                    pollIntervalMs: 5,
                    runId,
                })
            ).rejects.toThrow('projection failed')

            expect(repository.run.executionOwnerId).toBeNull()
            expect(vi.getTimerCount()).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('cancels a run waiting behind projection backpressure without leaking the poller', async () => {
        vi.useFakeTimers()
        try {
            let releaseExecution: (() => void) | undefined
            const execution = coordinator.startExecution({
                execute: async context => {
                    await new Promise<void>(resolve => {
                        releaseExecution = resolve
                        context.signal.addEventListener('abort', () => resolve(), { once: true })
                    })
                    return context.signal.aborted ? 'cancelled' : 'completed'
                },
                ownerSessionHash,
                pollIntervalMs: 5,
                runId,
            })

            await Promise.resolve()
            await coordinator.requestCancel({ now, ownerSessionHash, runId })
            releaseExecution?.()

            await expect(execution).resolves.toBe('cancelled')
            expect(repository.run.executionOwnerId).toBeNull()
            expect(vi.getTimerCount()).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it('retries clearExecutionOwner on transient failure without leaking the owner', async () => {
        vi.useFakeTimers()
        try {
            let clearAttempts = 0
            const flakyRepository = new FakeExecutionRepository()
            const clear = flakyRepository.clearExecutionOwner.bind(flakyRepository)
            flakyRepository.clearExecutionOwner = async input => {
                clearAttempts += 1
                if (clearAttempts < 3) {
                    throw new Error('transient database error')
                }
                await clear(input)
            }
            const flakyCoordinator = new StreamExecutionCoordinator(flakyRepository, () => 'owner_retry')

            const execution = flakyCoordinator.startExecution({
                execute: async () => 'completed',
                ownerSessionHash,
                runId,
            })

            await vi.runAllTimersAsync()
            await expect(execution).resolves.toBe('completed')
            expect(clearAttempts).toBe(3)
            expect(flakyRepository.run.executionOwnerId).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not override the execution result when owner cleanup keeps failing', async () => {
        vi.useFakeTimers()
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const failingRepository = new FakeExecutionRepository()
            failingRepository.clearExecutionOwner = async () => {
                throw new Error('persistent database error')
            }
            const failingCoordinator = new StreamExecutionCoordinator(failingRepository, () => 'owner_leak')

            const execution = failingCoordinator.startExecution({
                execute: async () => 'still-completed',
                ownerSessionHash,
                runId,
            })

            await vi.runAllTimersAsync()
            await expect(execution).resolves.toBe('still-completed')
            expect(failingRepository.run.executionOwnerId).toBe('owner_leak')
            expect(errorSpy).toHaveBeenCalled()
        } finally {
            errorSpy.mockRestore()
            vi.useRealTimers()
        }
    })
})
