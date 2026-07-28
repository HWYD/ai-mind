import { getPrismaClient } from '@ai-mind/database'
import { streamProtocolVersion } from '@ai-mind/stream-core/protocol'

import {
    type StreamEventEnvelopeDto,
    streamEventEnvelopeSchema,
    type StreamRunStatusDto,
    type StreamTerminalStateDto,
} from '@/lib/ai/stream-recovery/contracts'

export type StreamRunKindDto = 'chat' | 'tasklist_agent' | 'delivery_chain'
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
    create(args: { data: PersistedStreamEventInput }): Promise<StreamEventRecord>
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
        callback: (transaction: Pick<StreamEventStorePrismaClient, '$queryRaw' | 'streamEvent' | 'streamRun'>) => Promise<T>
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

    async appendEvent(input: AppendStreamEventInput): Promise<StreamEventEnvelopeDto> {
        return this.prisma.$transaction(async transaction => {
            await lockStreamRunForAppend(transaction, input.runId)
            const run = await this.getOwnedRun(transaction, input.runId, input.ownerSessionHash)

            if (isTerminalRun(run)) {
                throw new StreamEventStoreError('STREAM_RUN_TERMINAL', 'Cannot append events to a terminal stream run.')
            }

            const sequence = run.lastSequence + 1
            const now = input.now ?? new Date()
            const expiresAt = new Date(now.getTime() + defaultEventRetentionMs)
            const terminal = Boolean(input.terminalState)
            const envelope: StreamEventEnvelopeDto = {
                eventId: this.createEventId(),
                eventKind: terminal ? 'terminal' : input.eventKind,
                payload: input.payload,
                protocolVersion: streamProtocolVersion,
                runId: run.id,
                sequence,
                ...(input.runStatus ? { runStatus: input.runStatus } : {}),
                ...(terminal ? { terminal: true, terminalState: input.terminalState } : {}),
            }
            const parsedEnvelope = streamEventEnvelopeSchema.safeParse(envelope)

            if (!parsedEnvelope.success) {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event envelope failed validation.')
            }

            const payloadByteLength = calculatePayloadByteLength(parsedEnvelope.data.payload)

            if (payloadByteLength > run.maxEventPayloadBytes) {
                throw new StreamEventStoreError(
                    'STREAM_EVENT_PAYLOAD_TOO_LARGE',
                    'Stream event payload exceeds the configured per-run payload boundary.'
                )
            }

            if (input.agentRunId && run.agentRunId && input.agentRunId !== run.agentRunId) {
                throw new StreamEventStoreError('STREAM_EVENT_INVALID', 'Stream event agentRunId does not match the linked AgentRun.')
            }

            const persistedEvent = await transaction.streamEvent.create({
                data: {
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
                },
            })
            const terminalError = terminal && parsedEnvelope.data.payload.type === 'error' ? parsedEnvelope.data.payload : undefined
            await transaction.streamRun.update({
                data: {
                    ...(input.agentRunId && run.agentRunId === null ? { agentRunId: input.agentRunId } : {}),
                    completedAt: terminal ? now : run.completedAt,
                    ...(terminalError
                        ? {
                              failureCode: terminalError.errorCode,
                              publicFailureMessage: terminalError.message,
                          }
                        : {}),
                    lastSequence: sequence,
                    retentionUntil: new Date(Math.max(run.retentionUntil.getTime(), expiresAt.getTime())),
                    status: parsedEnvelope.data.terminalState ?? parsedEnvelope.data.runStatus ?? run.status,
                    terminalSequence: terminal ? sequence : run.terminalSequence,
                },
                where: {
                    id: run.id,
                },
            })
            await this.trimRunEvents(transaction, run, sequence)

            return toEnvelope(persistedEvent)
        })
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

function calculatePayloadByteLength(payload: StreamEventEnvelopeDto['payload']): number {
    return new TextEncoder().encode(JSON.stringify(payload)).length
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
