import { createHash } from 'node:crypto'

import { getPrismaClient } from '@ai-mind/database'

import {
    type StreamCursor,
    streamCursorSchema,
    type StreamReplayDescriptor,
    streamReplayDescriptorSchema,
    type StreamRunStatusDto,
} from '@/lib/ai/stream-recovery/contracts'
import type { StreamRunKindDto, StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'

export type StreamRunServiceErrorCode =
    | 'CURSOR_AHEAD'
    | 'CURSOR_EXPIRED'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INVALID_IDEMPOTENCY_KEY'
    | 'INVALID_CURSOR'
    | 'STREAM_RUN_FORBIDDEN'
    | 'STREAM_RUN_NOT_FOUND'

export class StreamRunServiceError extends Error {
    readonly code: StreamRunServiceErrorCode

    constructor(code: StreamRunServiceErrorCode, message: string) {
        super(message)
        this.name = 'StreamRunServiceError'
        this.code = code
    }
}

export type StreamRequestRecord = {
    id: string
    ownerSessionHash: string
    idempotencyKey: string
    requestFingerprint: string
    runId: string
    createdAt: Date
    expiresAt: Date
    run?: StreamRunRecord
}

export type CreateOrReuseStreamRunInput = {
    kind: StreamRunKindDto
    ownerSessionHash: string
    idempotencyKey: string
    request: unknown
    agentRunId?: string
    runId?: string
    now?: Date
    retentionMs?: number
    idempotencyRetentionMs?: number
}

export type CreatedStreamRunResult = {
    type: 'created'
    request: StreamRequestRecord
    run: StreamRunRecord
    streamUrl: string
}

export type ReplayedStreamRunResult = {
    type: 'replay'
    request: StreamRequestRecord
    descriptor: StreamReplayDescriptor
}

export type CreateOrReuseStreamRunResult = CreatedStreamRunResult | ReplayedStreamRunResult

export type SafeStreamFinalState = {
    runId: string
    status: StreamRunStatusDto
    lastSequence: number
    terminalSequence: number | null
    canRetrieveFinalState: boolean
    canRestart: boolean
    failureCode?: string
    publicFailureMessage?: string
}

type StreamRequestDelegate = {
    create(args: {
        data: {
            id?: string
            ownerSessionHash: string
            idempotencyKey: string
            requestFingerprint: string
            runId: string
            expiresAt: Date
        }
    }): Promise<StreamRequestRecord>
    deleteMany(args: { where: { id: string } }): Promise<{ count: number }>
    findUnique(args: {
        include?: { run: boolean }
        where: {
            ownerSessionHash_idempotencyKey: {
                ownerSessionHash: string
                idempotencyKey: string
            }
        }
    }): Promise<StreamRequestRecord | null>
}

type StreamRunDelegate = {
    create(args: {
        data: {
            id?: string
            kind: StreamRunKindDto
            ownerSessionHash: string
            agentRunId?: string
            status: StreamRunStatusDto
            retentionUntil: Date
            maxRetainedEvents: number
            maxEventPayloadBytes: number
        }
    }): Promise<StreamRunRecord>
    findUnique(args: { where: { id: string } }): Promise<StreamRunRecord | null>
}

type StreamRunServicePrismaClient = {
    streamRequest: StreamRequestDelegate
    streamRun: StreamRunDelegate
    $transaction<T>(callback: (transaction: Pick<StreamRunServicePrismaClient, 'streamRequest' | 'streamRun'>) => Promise<T>): Promise<T>
}

const defaultRetentionMs = 10 * 60 * 1000
const defaultIdempotencyRetentionMs = 10 * 60 * 1000
const defaultMaxRetainedEvents = 20_000
const defaultMaxEventPayloadBytes = 256 * 1024
const terminalRunStatuses: ReadonlySet<StreamRunStatusDto> = new Set(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'])

export class StreamRunService {
    constructor(private readonly prisma: StreamRunServicePrismaClient = getPrismaClient() as unknown as StreamRunServicePrismaClient) {}

    async hasReusableRequest(input: { ownerSessionHash: string; idempotencyKey: string; now?: Date }): Promise<boolean> {
        const now = input.now ?? new Date()
        const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
        const request = await this.prisma.streamRequest.findUnique({
            include: { run: true },
            where: {
                ownerSessionHash_idempotencyKey: {
                    idempotencyKey,
                    ownerSessionHash: input.ownerSessionHash,
                },
            },
        })

        if (!request) {
            return false
        }

        const run = request.run ?? (await this.prisma.streamRun.findUnique({ where: { id: request.runId } }))

        return Boolean(run && !canReuseExpiredIdempotencyScope(request, run, now))
    }

    async createOrReuseRun(input: CreateOrReuseStreamRunInput): Promise<CreateOrReuseStreamRunResult> {
        const now = input.now ?? new Date()
        const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
        const requestFingerprint = createRequestFingerprint({
            kind: input.kind,
            request: input.request,
        })

        try {
            return await this.prisma.$transaction(async transaction => {
                const replay = await this.reuseExistingRequest(transaction, {
                    idempotencyKey,
                    now,
                    ownerSessionHash: input.ownerSessionHash,
                    requestFingerprint,
                })

                if (replay) {
                    return replay
                }

                const retentionUntil = new Date(now.getTime() + (input.retentionMs ?? defaultRetentionMs))
                const idempotencyExpiresAt = new Date(
                    Math.max(retentionUntil.getTime(), now.getTime() + (input.idempotencyRetentionMs ?? defaultIdempotencyRetentionMs))
                )
                const run = await transaction.streamRun.create({
                    data: {
                        ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
                        ...(input.runId ? { id: input.runId } : {}),
                        kind: input.kind,
                        maxEventPayloadBytes: defaultMaxEventPayloadBytes,
                        maxRetainedEvents: defaultMaxRetainedEvents,
                        ownerSessionHash: input.ownerSessionHash,
                        retentionUntil,
                        status: 'running',
                    },
                })
                const request = await transaction.streamRequest.create({
                    data: {
                        expiresAt: idempotencyExpiresAt,
                        idempotencyKey,
                        ownerSessionHash: input.ownerSessionHash,
                        requestFingerprint,
                        runId: run.id,
                    },
                })

                return {
                    request: {
                        ...request,
                        run,
                    },
                    run,
                    streamUrl: createStreamUrl(run.id),
                    type: 'created',
                }
            })
        } catch (error) {
            if (!isUniqueConstraintError(error)) {
                throw error
            }

            const replay = await this.reuseExistingRequest(this.prisma, {
                idempotencyKey,
                now,
                ownerSessionHash: input.ownerSessionHash,
                requestFingerprint,
            })

            if (replay) {
                return replay
            }

            throw error
        }
    }

    private async reuseExistingRequest(
        client: Pick<StreamRunServicePrismaClient, 'streamRequest' | 'streamRun'>,
        input: {
            idempotencyKey: string
            now: Date
            ownerSessionHash: string
            requestFingerprint: string
        }
    ): Promise<ReplayedStreamRunResult | null> {
        const existingRequest = await client.streamRequest.findUnique({
            include: {
                run: true,
            },
            where: {
                ownerSessionHash_idempotencyKey: {
                    idempotencyKey: input.idempotencyKey,
                    ownerSessionHash: input.ownerSessionHash,
                },
            },
        })

        if (!existingRequest) {
            return null
        }

        const existingRun = existingRequest.run ?? (await client.streamRun.findUnique({ where: { id: existingRequest.runId } }))

        if (!existingRun) {
            throw new StreamRunServiceError('STREAM_RUN_NOT_FOUND', 'Idempotency record points to a missing stream run.')
        }

        if (canReuseExpiredIdempotencyScope(existingRequest, existingRun, input.now)) {
            await client.streamRequest.deleteMany({
                where: {
                    id: existingRequest.id,
                },
            })

            return null
        }

        if (existingRequest.requestFingerprint !== input.requestFingerprint) {
            throw new StreamRunServiceError('IDEMPOTENCY_CONFLICT', 'Idempotency-Key was already used for a different stream request.')
        }

        return {
            descriptor: createReplayDescriptor(existingRun),
            request: {
                ...existingRequest,
                run: existingRun,
            },
            type: 'replay',
        }
    }

    async validateCursor(input: StreamCursor & { ownerSessionHash: string; now?: Date }): Promise<StreamRunRecord> {
        const parsedCursor = streamCursorSchema.safeParse({
            after: input.after,
            lastEventId: input.lastEventId,
            protocolVersion: input.protocolVersion,
            runId: input.runId,
        })

        if (!parsedCursor.success) {
            throw new StreamRunServiceError('INVALID_CURSOR', 'Stream cursor is malformed.')
        }

        const run = await this.getOwnedRun(parsedCursor.data.runId, input.ownerSessionHash)
        const now = input.now ?? new Date()

        if (now > run.retentionUntil) {
            throw new StreamRunServiceError('CURSOR_EXPIRED', 'Stream cursor is outside the retained window.')
        }

        if (parsedCursor.data.after > run.lastSequence) {
            throw new StreamRunServiceError('CURSOR_AHEAD', 'Stream cursor is ahead of server progress.')
        }

        return run
    }

    async getSafeFinalState(input: { runId: string; ownerSessionHash: string; now?: Date }): Promise<SafeStreamFinalState> {
        const run = await this.getOwnedRun(input.runId, input.ownerSessionHash)
        const now = input.now ?? new Date()
        const canRetrieveFinalState = now <= run.retentionUntil
        const isTerminal = terminalRunStatuses.has(run.status)

        return {
            canRestart: !canRetrieveFinalState || isTerminal,
            canRetrieveFinalState,
            lastSequence: run.lastSequence,
            runId: run.id,
            status: run.status,
            terminalSequence: run.terminalSequence,
            ...(run.failureCode ? { failureCode: run.failureCode } : {}),
            ...(run.publicFailureMessage ? { publicFailureMessage: run.publicFailureMessage } : {}),
        }
    }

    private async getOwnedRun(runId: string, ownerSessionHash: string): Promise<StreamRunRecord> {
        const run = await this.prisma.streamRun.findUnique({
            where: {
                id: runId,
            },
        })

        if (!run) {
            throw new StreamRunServiceError('STREAM_RUN_NOT_FOUND', 'Stream run was not found.')
        }

        if (run.ownerSessionHash !== ownerSessionHash) {
            throw new StreamRunServiceError('STREAM_RUN_FORBIDDEN', 'Stream run does not belong to this owner session.')
        }

        return run
    }
}

export function createRequestFingerprint(value: unknown): string {
    return createHash('sha256').update(toCanonicalJson(value)).digest('hex')
}

function normalizeIdempotencyKey(idempotencyKey: string): string {
    const normalized = idempotencyKey.trim()

    if (!normalized || normalized.length > 128) {
        throw new StreamRunServiceError('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be non-empty and at most 128 characters.')
    }

    return normalized
}

function isUniqueConstraintError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
}

function canReuseExpiredIdempotencyScope(request: StreamRequestRecord, run: StreamRunRecord, now: Date): boolean {
    return request.expiresAt < now && run.retentionUntil < now && terminalRunStatuses.has(run.status)
}

function createReplayDescriptor(run: StreamRunRecord): StreamReplayDescriptor {
    return streamReplayDescriptorSchema.parse({
        kind: 'stream-replay',
        lastSequence: run.lastSequence,
        replayed: true,
        runId: run.id,
        status: run.status,
        streamUrl: createStreamUrl(run.id),
    })
}

function createStreamUrl(runId: string): string {
    return `/api/chat/runs/${encodeURIComponent(runId)}/stream`
}

function toCanonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value)
    }

    if (Array.isArray(value)) {
        return `[${value.map(toCanonicalJson).join(',')}]`
    }

    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
        .filter(key => record[key] !== undefined)
        .sort()
        .map(key => `${JSON.stringify(key)}:${toCanonicalJson(record[key])}`)

    return `{${entries.join(',')}}`
}
