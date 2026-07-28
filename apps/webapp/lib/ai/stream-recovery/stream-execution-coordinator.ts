import { randomUUID } from 'node:crypto'

import { getPrismaClient } from '@ai-mind/database'

import type { StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'

export type StreamExecutionCoordinatorErrorCode =
    | 'STREAM_EXECUTION_ALREADY_ACTIVE'
    | 'STREAM_EXECUTION_CANCELLED'
    | 'STREAM_EXECUTION_NOT_STARTABLE'
    | 'STREAM_RUN_FORBIDDEN'
    | 'STREAM_RUN_NOT_FOUND'

export class StreamExecutionCoordinatorError extends Error {
    readonly code: StreamExecutionCoordinatorErrorCode

    constructor(code: StreamExecutionCoordinatorErrorCode, message: string) {
        super(message)
        this.name = 'StreamExecutionCoordinatorError'
        this.code = code
    }
}

export type StreamExecutionContext = {
    executionOwnerId: string
    signal: AbortSignal
}

export type StartStreamExecutionInput<T> = {
    runId: string
    ownerSessionHash: string
    requestSignal?: AbortSignal
    pollIntervalMs?: number
    execute: (context: StreamExecutionContext) => Promise<T>
}

export interface StreamExecutionRepository {
    claimExecution(input: { runId: string; ownerSessionHash: string; executionOwnerId: string }): Promise<StreamRunRecord>
    clearExecutionOwner(input: { runId: string; executionOwnerId: string }): Promise<void>
    getCancelRequestedAt(runId: string): Promise<Date | null>
    markCancelRequested(input: { runId: string; ownerSessionHash: string; now: Date }): Promise<StreamRunRecord>
}

type ActiveExecution = {
    controller: AbortController
    executionOwnerId: string
}

export class StreamExecutionCoordinator {
    private readonly activeExecutions = new Map<string, ActiveExecution>()

    constructor(
        private readonly repository: StreamExecutionRepository = new PrismaStreamExecutionRepository(),
        private readonly createExecutionOwnerId: () => string = () => randomUUID()
    ) {}

    async startExecution<T>(input: StartStreamExecutionInput<T>): Promise<T> {
        if (this.activeExecutions.has(input.runId)) {
            throw new StreamExecutionCoordinatorError('STREAM_EXECUTION_ALREADY_ACTIVE', 'Stream run already has an active executor.')
        }

        const executionOwnerId = this.createExecutionOwnerId()
        await this.repository.claimExecution({
            executionOwnerId,
            ownerSessionHash: input.ownerSessionHash,
            runId: input.runId,
        })

        const controller = new AbortController()
        this.activeExecutions.set(input.runId, {
            controller,
            executionOwnerId,
        })

        let cancelPoller: ReturnType<typeof setInterval> | undefined

        try {
            // requestSignal 只代表 HTTP 传输生命周期；可恢复流断线后，后台执行必须继续由 run-scoped signal 驱动。
            await this.abortIfCancelRequested(input.runId, controller)
            cancelPoller = setInterval(() => {
                void this.abortIfCancelRequested(input.runId, controller)
            }, input.pollIntervalMs ?? 1_000)

            return await input.execute({
                executionOwnerId,
                signal: controller.signal,
            })
        } finally {
            if (cancelPoller) {
                clearInterval(cancelPoller)
            }

            this.activeExecutions.delete(input.runId)
            await this.repository.clearExecutionOwner({
                executionOwnerId,
                runId: input.runId,
            })
        }
    }

    async requestCancel(input: { runId: string; ownerSessionHash: string; now?: Date }): Promise<StreamRunRecord> {
        const run = await this.repository.markCancelRequested({
            now: input.now ?? new Date(),
            ownerSessionHash: input.ownerSessionHash,
            runId: input.runId,
        })
        this.activeExecutions.get(input.runId)?.controller.abort()

        return run
    }

    isExecutionActive(runId: string): boolean {
        return this.activeExecutions.has(runId)
    }

    getCancelRequestedAt(runId: string): Promise<Date | null> {
        return this.repository.getCancelRequestedAt(runId)
    }

    private async abortIfCancelRequested(runId: string, controller: AbortController): Promise<void> {
        if (controller.signal.aborted) {
            return
        }

        if (await this.repository.getCancelRequestedAt(runId)) {
            controller.abort()
        }
    }
}

type PrismaLike = {
    streamRun: {
        findUnique(args: { where: { id: string } }): Promise<StreamRunRecord | null>
        updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
    }
}

class PrismaStreamExecutionRepository implements StreamExecutionRepository {
    constructor(private readonly prisma: PrismaLike = getPrismaClient() as unknown as PrismaLike) {}

    async claimExecution(input: { runId: string; ownerSessionHash: string; executionOwnerId: string }): Promise<StreamRunRecord> {
        const claimed = await this.prisma.streamRun.updateMany({
            data: {
                executionOwnerId: input.executionOwnerId,
            },
            where: {
                executionOwnerId: null,
                id: input.runId,
                ownerSessionHash: input.ownerSessionHash,
                status: {
                    in: ['running', 'paused'],
                },
            },
        })

        if (claimed.count === 1) {
            return this.prisma.streamRun.findUnique({ where: { id: input.runId } }) as Promise<StreamRunRecord>
        }

        const run = await this.prisma.streamRun.findUnique({
            where: {
                id: input.runId,
            },
        })

        if (!run) {
            throw new StreamExecutionCoordinatorError('STREAM_RUN_NOT_FOUND', 'Stream run was not found.')
        }

        if (run.ownerSessionHash !== input.ownerSessionHash) {
            throw new StreamExecutionCoordinatorError('STREAM_RUN_FORBIDDEN', 'Stream run does not belong to this owner session.')
        }

        if (run.executionOwnerId) {
            throw new StreamExecutionCoordinatorError('STREAM_EXECUTION_ALREADY_ACTIVE', 'Stream run already has an execution owner.')
        }

        throw new StreamExecutionCoordinatorError('STREAM_EXECUTION_NOT_STARTABLE', 'Stream run is not in a startable state.')
    }

    async clearExecutionOwner(input: { runId: string; executionOwnerId: string }): Promise<void> {
        await this.prisma.streamRun.updateMany({
            data: {
                executionOwnerId: null,
            },
            where: {
                executionOwnerId: input.executionOwnerId,
                id: input.runId,
            },
        })
    }

    async getCancelRequestedAt(runId: string): Promise<Date | null> {
        const run = await this.prisma.streamRun.findUnique({
            where: {
                id: runId,
            },
        })

        return run?.cancelRequestedAt ?? null
    }

    async markCancelRequested(input: { runId: string; ownerSessionHash: string; now: Date }): Promise<StreamRunRecord> {
        await this.prisma.streamRun.updateMany({
            data: {
                cancelRequestedAt: input.now,
            },
            where: {
                id: input.runId,
                ownerSessionHash: input.ownerSessionHash,
                status: {
                    in: ['running', 'paused'],
                },
            },
        })

        const run = await this.prisma.streamRun.findUnique({
            where: {
                id: input.runId,
            },
        })

        if (!run) {
            throw new StreamExecutionCoordinatorError('STREAM_RUN_NOT_FOUND', 'Stream run was not found.')
        }

        if (run.ownerSessionHash !== input.ownerSessionHash) {
            throw new StreamExecutionCoordinatorError('STREAM_RUN_FORBIDDEN', 'Stream run does not belong to this owner session.')
        }

        return run
    }
}
