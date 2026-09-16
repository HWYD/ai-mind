import { getPrismaClient } from '@ai-mind/database'
import { streamProtocolVersion } from '@ai-mind/stream-core/protocol'

import {
    type StreamEventEnvelopeDto,
    streamEventEnvelopeSchema,
    type StreamRunKindDto,
    type StreamRunStatusDto,
    type StreamTerminalStateDto,
} from '@/lib/ai/stream-recovery/contracts'

export type { StreamRunKindDto } from '@/lib/ai/stream-recovery/contracts'
export type StreamEventKindDto = 'chunk' | 'lifecycle' | 'terminal'

export type StreamEventStoreErrorCode =
    | 'CURSOR_AHEAD'
    | 'CURSOR_EXPIRED'
    | 'STREAM_EVENT_INVALID'
    | 'STREAM_EVENT_PAYLOAD_TOO_LARGE'
    | 'STREAM_RUN_FORBIDDEN'
    | 'STREAM_RUN_NOT_FOUND'
    | 'STREAM_RUN_TERMINAL'

export class StreamEventStoreError extends Error {
    readonly code: StreamEventStoreErrorCode
    readonly earliestRetainedSequence?: number

    constructor(code: StreamEventStoreErrorCode, message: string, details: { earliestRetainedSequence?: number } = {}) {
        super(message)
        this.name = 'StreamEventStoreError'
        this.code = code
        this.earliestRetainedSequence = details.earliestRetainedSequence
    }
}

export type StreamRunRecord = {
    id: string
    kind: StreamRunKindDto
    ownerSessionHash: string
    agentRunId: string | null
    status: StreamRunStatusDto
    lastSequence: number
    terminalSequence: number | null
    retentionUntil: Date
    executionOwnerId: string | null
    cancelRequestedAt: Date | null
    maxRetainedEvents: number
    maxEventPayloadBytes: number
    failureCode: string | null
    publicFailureMessage: string | null
    createdAt: Date
    updatedAt: Date
    completedAt: Date | null
}

export type StreamEventRecord = {
    id: string
    runId: string
    sequence: number
    eventKind: StreamEventKindDto
    protocolVersion: number
    payload: unknown
    payloadByteLength: number
    runStatus: StreamRunStatusDto | null
    terminalState: StreamTerminalStateDto | null
    terminal: boolean
    createdAt: Date
    expiresAt: Date
}

export type AppendStreamEventInput = {
    agentRunId?: string
    runId: string
    ownerSessionHash: string
    eventKind: StreamEventKindDto
    payload: StreamEventEnvelopeDto['payload']
    runStatus?: StreamRunStatusDto
    terminalState?: StreamTerminalStateDto
    now?: Date
}

export type AppendStreamEventsOptions = {
    deadlineAtMs?: number
}

export type ReplayStreamEventsInput = {
    runId: string
    ownerSessionHash: string
    after: number
    now?: Date
}

export type OwnedStreamRunInput = {
    runId: string
    ownerSessionHash: string
}

export type ReplayStreamEventsResult = {
    run: StreamRunRecord
    events: StreamEventEnvelopeDto[]
}

export type CleanupExpiredStreamEventsInput = {
    now?: Date
}

type StreamRunDelegate = {
    findUnique(args: { where: { id: string } }): Promise<StreamRunRecord | null>
    update(args: {
        where: { id: string }
        data: Partial<
            Pick<
                StreamRunRecord,
                | 'agentRunId'
                | 'completedAt'
                | 'failureCode'
                | 'lastSequence'
                | 'publicFailureMessage'
                | 'status'
                | 'terminalSequence'
                | 'retentionUntil'
            >
        >
    }): Promise<StreamRunRecord>
}

type StreamEventDelegate = {
    createMany(args: { data: PersistedStreamEventInput[] }): Promise<{ count: number }>
    deleteMany(args: {
        where: {
            expiresAt?: { lte: Date }
            runId?: string
            sequence?: { lte: number }
        }
    }): Promise<{ count: number }>
    findFirst(args: {
        where: { runId: string; terminal?: boolean }
        orderBy: { sequence: 'asc' | 'desc' }
    }): Promise<StreamEventRecord | null>
    findMany(args: {
        where: { runId: string; sequence?: { gt: number }; expiresAt?: { gt: Date } }
        orderBy: { sequence: 'asc' }
    }): Promise<StreamEventRecord[]>
}

type StreamEventStorePrismaClient = {
    streamRun: StreamRunDelegate
    streamEvent: StreamEventDelegate
    $queryRaw?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>
    $transaction<T>(
        callback: (transaction: Pick<StreamEventStorePrismaClient, '$queryRaw' | 'streamEvent' | 'streamRun'>) => Promise<T>,
        options?: { maxWait: number; timeout: number }
    ): Promise<T>
}

type PersistedStreamEventInput = {
    id: string
    runId: string
    sequence: number
    eventKind: StreamEventKindDto
    protocolVersion: number
    payload: StreamEventEnvelopeDto['payload']
    payloadByteLength: number
    runStatus: StreamRunStatusDto | null
    terminalState: StreamTerminalStateDto | null
    terminal: boolean
    expiresAt: Date
}

const terminalRunStatuses: ReadonlySet<StreamRunStatusDto> = new Set(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'])
const defaultEventRetentionMs = 10 * 60 * 1000
const maximumTrimBatchSize = 200

export class StreamEventStore {
    private readonly prisma: StreamEventStorePrismaClient
    private readonly createEventId: () => string

    constructor(
        prisma: StreamEventStorePrismaClient = getPrismaClient() as unknown as StreamEventStorePrismaClient,
        options: { createEventId?: () => string } = {}
    ) {
        this.prisma = prisma
        this.createEventId = options.createEventId ?? (() => crypto.randomUUID())
    }

    async appendEvent(input: AppendStreamEventInput, options: AppendStreamEventsOptions = {}): Promise<StreamEventEnvelopeDto> {
        const events = await this.appendEvents([input], options)
        return events[0]!
    }

    async appendEvents(
        inputs: readonly AppendStreamEventInput[],
        options: AppendStreamEventsOptions = {}
    ): Promise<StreamEventEnvelopeDto[]> {
        if (inputs.length === 0) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event batch must not be empty.')
        }

        const firstInput = inputs[0]!
        if (inputs.some(input => input.runId !== firstInput.runId || input.ownerSessionHash !== firstInput.ownerSessionHash)) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event batch must belong to one run and owner.')
        }

        const terminalIndex = inputs.findIndex(input => input.terminalState !== undefined)
        if (terminalIndex >= 0 && terminalIndex !== inputs.length - 1) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Terminal stream event must be the final event in its batch.')
        }

        const transactionOptions = resolveBatchTransactionOptions(options.deadlineAtMs)

        return this.prisma.$transaction(async transaction => {
            await lockStreamRunForAppend(transaction, firstInput.runId)
            const run = await this.getOwnedRun(transaction, firstInput.runId, firstInput.ownerSessionHash)

            if (isTerminalRun(run)) {
                throw new StreamEventStoreError('STREAM_RUN_TERMINAL', 'Cannot append events to a terminal stream run.')
            }

            const agentRunIds = [...new Set(inputs.map(input => input.agentRunId).filter((value): value is string => Boolean(value)))]
            if (agentRunIds.length > 1 || (agentRunIds[0] && run.agentRunId && agentRunIds[0] !== run.agentRunId)) {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event agentRunId does not match the linked AgentRun.')
            }
            if (agentRunIds.length > 0 && run.kind !== 'tasklist_agent') {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Only Tasklist stream runs can link an AgentRun.')
            }

            const persistedInputs: PersistedStreamEventInput[] = []
            const envelopes: StreamEventEnvelopeDto[] = []
            let retentionUntilMs = run.retentionUntil.getTime()
            let nextRunStatus = run.status

            for (const [index, input] of inputs.entries()) {
                const sequence = run.lastSequence + index + 1
                const now = input.now ?? new Date()
                const expiresAt = new Date(now.getTime() + defaultEventRetentionMs)
                const terminal = input.terminalState !== undefined
                const effectiveRunStatus = input.runStatus ?? (terminal ? input.terminalState : undefined)
                if (!terminal && effectiveRunStatus && terminalRunStatuses.has(effectiveRunStatus)) {
                    throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Terminal StreamRun status requires a terminal event.')
                }
                const parsedEnvelope = streamEventEnvelopeSchema.safeParse({
                    eventId: this.createEventId(),
                    eventKind: terminal ? 'terminal' : input.eventKind,
                    payload: input.payload,
                    protocolVersion: streamProtocolVersion,
                    runId: run.id,
                    sequence,
                    ...(effectiveRunStatus ? { runStatus: effectiveRunStatus } : {}),
                    ...(terminal ? { terminal: true, terminalState: input.terminalState } : {}),
                })

                if (!parsedEnvelope.success) {
                    throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event envelope failed validation.')
                }

                if (
                    parsedEnvelope.data.terminal &&
                    (!parsedEnvelope.data.terminalState ||
                        parsedEnvelope.data.runStatus !== parsedEnvelope.data.terminalState ||
                        !isTerminalPayloadConsistent(parsedEnvelope.data.terminalState, parsedEnvelope.data.payload))
                ) {
                    throw new StreamEventStoreError(
                        'STREAM_EVENT_INVALID',
                        'Terminal stream event payload does not match its terminal state.'
                    )
                }

                const payloadByteLength = calculatePayloadByteLength(parsedEnvelope.data.payload)
                if (payloadByteLength > run.maxEventPayloadBytes) {
                    throw new StreamEventStoreError(
                        'STREAM_EVENT_PAYLOAD_TOO_LARGE',
                        'Stream event payload exceeds the configured per-run payload boundary.'
                    )
                }

                retentionUntilMs = Math.max(retentionUntilMs, expiresAt.getTime())
                nextRunStatus = parsedEnvelope.data.terminalState ?? parsedEnvelope.data.runStatus ?? nextRunStatus
                envelopes.push(parsedEnvelope.data)
                persistedInputs.push({
                    eventKind: parsedEnvelope.data.eventKind,
                    expiresAt,
                    id: parsedEnvelope.data.eventId,
                    payload: parsedEnvelope.data.payload,
                    payloadByteLength,
                    protocolVersion: streamProtocolVersion,
                    runId: run.id,
                    runStatus: parsedEnvelope.data.runStatus ?? null,
                    sequence,
                    terminal,
                    terminalState: parsedEnvelope.data.terminalState ?? null,
                })
            }

            const createResult = await transaction.streamEvent.createMany({ data: persistedInputs })
            if (createResult.count !== persistedInputs.length) {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event batch insert was incomplete.')
            }

            const lastEnvelope = envelopes.at(-1)!
            const lastInput = inputs.at(-1)!
            const terminal = lastEnvelope.terminal === true
            const terminalError = terminal && lastEnvelope.payload.type === 'error' ? lastEnvelope.payload : undefined
            const lastSequence = lastEnvelope.sequence

            await transaction.streamRun.update({
                data: {
                    ...(agentRunIds[0] && run.agentRunId === null ? { agentRunId: agentRunIds[0] } : {}),
                    completedAt: terminal ? (lastInput.now ?? new Date()) : run.completedAt,
                    ...(terminalError
                        ? {
                              failureCode: terminalError.errorCode,
                              publicFailureMessage: terminalError.message,
                          }
                        : {}),
                    lastSequence,
                    retentionUntil: new Date(retentionUntilMs),
                    status: nextRunStatus,
                    terminalSequence: terminal ? lastSequence : run.terminalSequence,
                },
                where: {
                    id: run.id,
                },
            })
            await this.trimRunEvents(transaction, run, lastSequence)

            return envelopes
        }, transactionOptions)
    }

    async replayEvents(input: ReplayStreamEventsInput): Promise<ReplayStreamEventsResult> {
        if (!Number.isInteger(input.after) || input.after < 0) {
            throw new StreamEventStoreError('CURSOR_AHEAD', 'Stream cursor sequence must be a non-negative integer.')
        }

        const now = input.now ?? new Date()
        const run = await this.getOwnedRun(this.prisma, input.runId, input.ownerSessionHash)

        if (now > run.retentionUntil) {
            throw new StreamEventStoreError('CURSOR_EXPIRED', 'Stream recovery cursor is outside the retained window.')
        }

        const terminalEvent = await this.prisma.streamEvent.findFirst({
            orderBy: {
                sequence: 'desc',
            },
            where: {
                runId: run.id,
                terminal: true,
            },
        })
        assertRunTerminalConsistency(run, terminalEvent)

        if (input.after > run.lastSequence) {
            throw new StreamEventStoreError('CURSOR_AHEAD', 'Stream recovery cursor is ahead of the persisted event log.')
        }

        const events = await this.prisma.streamEvent.findMany({
            orderBy: {
                sequence: 'asc',
            },
            where: {
                runId: run.id,
                sequence: {
                    gt: input.after,
                },
                expiresAt: {
                    gt: now,
                },
            },
        })

        if (events.length > 0 && events[0]!.sequence !== input.after + 1) {
            throw new StreamEventStoreError('CURSOR_EXPIRED', 'Stream recovery cursor points to events no longer retained.', {
                earliestRetainedSequence: events[0]!.sequence,
            })
        }

        if (events.length === 0 && input.after < run.lastSequence) {
            throw new StreamEventStoreError('CURSOR_EXPIRED', 'Stream recovery cursor points to events no longer retained.', {
                earliestRetainedSequence: run.lastSequence + 1,
            })
        }

        return {
            events: events.map(toEnvelope),
            run,
        }
    }

    async getEarliestRetainedSequence(input: OwnedStreamRunInput): Promise<number> {
        const run = await this.getOwnedRun(this.prisma, input.runId, input.ownerSessionHash)
        const firstEvent = await this.prisma.streamEvent.findFirst({
            orderBy: {
                sequence: 'asc',
            },
            where: {
                runId: run.id,
            },
        })

        return firstEvent?.sequence ?? run.lastSequence + 1
    }

    async getTerminalEvent(input: OwnedStreamRunInput): Promise<StreamEventEnvelopeDto | null> {
        const run = await this.getOwnedRun(this.prisma, input.runId, input.ownerSessionHash)
        const terminalEvent = await this.prisma.streamEvent.findFirst({
            orderBy: {
                sequence: 'desc',
            },
            where: {
                runId: run.id,
                terminal: true,
            },
        })
        assertRunTerminalConsistency(run, terminalEvent)

        return terminalEvent ? toEnvelope(terminalEvent) : null
    }

    async deleteExpiredEvents(input: CleanupExpiredStreamEventsInput = {}): Promise<number> {
        const result = await this.prisma.streamEvent.deleteMany({
            where: {
                expiresAt: {
                    lte: input.now ?? new Date(),
                },
            },
        })

        return result.count
    }

    private async getOwnedRun(
        client: Pick<StreamEventStorePrismaClient, 'streamRun'>,
        runId: string,
        ownerSessionHash: string
    ): Promise<StreamRunRecord> {
        const run = await client.streamRun.findUnique({
            where: {
                id: runId,
            },
        })

        if (!run) {
            throw new StreamEventStoreError('STREAM_RUN_NOT_FOUND', 'Stream run was not found.')
        }

        if (run.ownerSessionHash !== ownerSessionHash) {
            throw new StreamEventStoreError('STREAM_RUN_FORBIDDEN', 'Stream run does not belong to this owner session.')
        }

        return run
    }

    private async trimRunEvents(
        client: Pick<StreamEventStorePrismaClient, 'streamEvent'>,
        run: StreamRunRecord,
        currentSequence: number
    ): Promise<void> {
        if (currentSequence <= run.maxRetainedEvents) {
            return
        }

        // 预留一小段空间，达到上限时一次回收一批旧事件，避免每个 token 都触发 delete。
        // 很小的测试/配置上没有可用缓冲，仍按严格上限逐条回收。
        const trimBatchSize =
            run.maxRetainedEvents <= 2
                ? 0
                : Math.min(maximumTrimBatchSize, run.maxRetainedEvents - 1, Math.max(1, Math.floor(run.maxRetainedEvents / 10)))

        if (trimBatchSize > 0 && (currentSequence - run.maxRetainedEvents - 1) % trimBatchSize !== 0) {
            return
        }

        const retainedEventTarget = run.maxRetainedEvents - trimBatchSize
        const lastRetainedSequence = currentSequence - retainedEventTarget

        if (lastRetainedSequence <= 0) {
            return
        }

        await client.streamEvent.deleteMany({
            where: {
                runId: run.id,
                sequence: {
                    lte: lastRetainedSequence,
                },
            },
        })
    }
}

async function lockStreamRunForAppend(client: Pick<StreamEventStorePrismaClient, '$queryRaw'>, runId: string): Promise<void> {
    if (!client.$queryRaw) {
        return
    }

    await client.$queryRaw`
        SELECT "id"
        FROM "stream_runs"
        WHERE "id" = CAST(${runId} AS UUID)
        FOR UPDATE
    `
}

function isTerminalRun(run: StreamRunRecord): boolean {
    return run.terminalSequence !== null || terminalRunStatuses.has(run.status)
}

function assertRunTerminalConsistency(run: StreamRunRecord, terminalEvent: StreamEventRecord | null): void {
    const runIsTerminal = terminalRunStatuses.has(run.status)
    if ((run.terminalSequence !== null) !== runIsTerminal) {
        throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'StreamRun terminal status and terminalSequence are inconsistent.')
    }

    if (run.terminalSequence === null) {
        if (terminalEvent) {
            throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Terminal event exists for a non-terminal StreamRun.')
        }
        return
    }

    if (
        !terminalEvent ||
        run.terminalSequence !== run.lastSequence ||
        terminalEvent.sequence !== run.terminalSequence ||
        terminalEvent.sequence !== run.lastSequence ||
        terminalEvent.terminalState !== run.status ||
        terminalEvent.runStatus !== run.status ||
        !isTerminalPayloadConsistent(run.status, terminalEvent.payload)
    ) {
        throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'StreamRun status does not match its terminal event.')
    }
}

function isTerminalPayloadConsistent(status: StreamRunStatusDto, payload: unknown): boolean {
    if (!payload || typeof payload !== 'object' || !('type' in payload)) {
        return false
    }

    const type = (payload as { type?: unknown }).type
    if (type === 'run-status') {
        return (payload as { status?: unknown }).status === status
    }

    if (status === 'completed') {
        return type === 'finish'
    }
    if (status === 'failed') {
        return type === 'error'
    }
    if (status === 'cancelled' || status === 'rejected') {
        return type === 'finish' || type === 'error'
    }
    return false
}

function calculatePayloadByteLength(payload: StreamEventEnvelopeDto['payload']): number {
    return new TextEncoder().encode(JSON.stringify(payload)).length
}

function resolveBatchTransactionOptions(deadlineAtMs: number | undefined) {
    const remainingMs = deadlineAtMs === undefined ? Number.POSITIVE_INFINITY : deadlineAtMs - Date.now()

    if (remainingMs <= 0) {
        throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event batch deadline has expired.')
    }

    if (remainingMs === Number.POSITIVE_INFINITY) {
        return { maxWait: 2000, timeout: 5000 }
    }

    // Prisma 的 maxWait 与 timeout 是连续消耗的两个阶段；不能分别拿到完整的剩余 run budget。
    if (remainingMs < 2) {
        throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event batch deadline has insufficient transaction budget.')
    }

    const totalBudgetMs = Math.floor(remainingMs)
    const maxWait = Math.min(2000, Math.floor(totalBudgetMs / 2))

    return {
        maxWait: Math.max(1, maxWait),
        timeout: Math.max(1, Math.min(5000, totalBudgetMs - maxWait)),
    }
}

function toEnvelope(event: StreamEventRecord): StreamEventEnvelopeDto {
    const envelope = streamEventEnvelopeSchema.parse({
        eventId: event.id,
        eventKind: event.eventKind,
        payload: event.payload,
        protocolVersion: event.protocolVersion,
        runId: event.runId,
        runStatus: event.runStatus ?? undefined,
        sequence: event.sequence,
        terminal: event.terminal ? true : undefined,
        terminalState: event.terminalState ?? undefined,
    })

    return envelope
}
