import type { StreamEventEnvelope } from '@ai-mind/stream-core/protocol'
import { createNdjsonChunkWriter } from '@ai-mind/stream-core/web'
import type { NextRequest } from 'next/server'

import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs'
import { resolveSessionId } from '@/lib/ai/rate-limit'
import { createSafeStreamDiagnostics, RESUMABLE_STREAM_ACCEPT, type StreamEventEnvelopeDto } from '@/lib/ai/stream-recovery/contracts'
import type { ReplayStreamEventsResult, StreamRunRecord } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamEventStore, StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'
import { StreamRunService, StreamRunServiceError } from '@/lib/ai/stream-recovery/stream-run-service'

export const runtime = 'nodejs'

const streamProtocolHeader = 'ai-mind-resumable-v1'
const streamRecoveryHeartbeatIntervalMs = 15_000
const streamRecoveryPollIntervalMs = 500
const terminalRunStatuses = new Set(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch'])
let streamRunService: StreamRunService | undefined
let streamEventStore: StreamEventStore | undefined

function getStreamRunService() {
    streamRunService ??= new StreamRunService()

    return streamRunService
}

function getStreamEventStore() {
    streamEventStore ??= new StreamEventStore()

    return streamEventStore
}

function createStreamHeaders(setCookie?: string) {
    const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-transform',
        'Content-Type': RESUMABLE_STREAM_ACCEPT,
        'X-Accel-Buffering': 'no',
        'X-Stream-Protocol': streamProtocolHeader,
    }

    if (setCookie) {
        headers['Set-Cookie'] = setCookie
    }

    return headers
}

function parseCursor(request: NextRequest): { after: number } | Response {
    const url = new URL(request.url)
    const queryAfter = url.searchParams.get('after')?.trim()
    const headerAfter = request.headers.get('Last-Event-ID')?.trim()

    if (queryAfter && headerAfter && queryAfter !== headerAfter) {
        return Response.json(
            {
                code: 'INVALID_CURSOR',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'INVALID_CURSOR',
                    retryable: false,
                }),
                error: 'Last-Event-ID and after cursor must match when both are provided.',
            },
            { status: 400 }
        )
    }

    const rawAfter = headerAfter || queryAfter || '0'
    const after = Number(rawAfter)

    if (!Number.isInteger(after) || after < 0) {
        return Response.json(
            {
                code: 'INVALID_CURSOR',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'INVALID_CURSOR',
                    retryable: false,
                }),
                error: 'Stream cursor must be a non-negative integer sequence.',
            },
            { status: 400 }
        )
    }

    return { after }
}

function mapRecoveryError(
    error: StreamEventStoreError | StreamRunServiceError,
    finalState?: Awaited<ReturnType<StreamRunService['getSafeFinalState']>>
) {
    if (error.code === 'STREAM_RUN_FORBIDDEN') {
        return Response.json(
            {
                code: 'STREAM_RUN_FORBIDDEN',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'STREAM_RUN_FORBIDDEN',
                    retryable: false,
                }),
                error: 'Stream run was not found for the current browser session.',
            },
            { status: 403 }
        )
    }

    if (error.code === 'STREAM_RUN_NOT_FOUND') {
        return Response.json(
            {
                code: 'STREAM_RUN_NOT_FOUND',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'STREAM_RUN_NOT_FOUND',
                    retryable: false,
                }),
                error: 'Stream run was not found.',
            },
            { status: 404 }
        )
    }

    if (error.code === 'CURSOR_AHEAD') {
        return Response.json(
            {
                canRestart: false,
                canRetrieveFinalState: finalState?.canRetrieveFinalState ?? false,
                code: 'CURSOR_AHEAD',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'CURSOR_AHEAD',
                    retryable: false,
                    runId: finalState?.runId,
                    status: finalState?.status,
                }),
                error: error.message,
                runId: finalState?.runId,
                runStatus: finalState?.status,
            },
            { status: 409 }
        )
    }

    if (error.code === 'CURSOR_EXPIRED') {
        return Response.json(
            {
                canRestart: finalState?.canRestart ?? true,
                canRetrieveFinalState: finalState?.canRetrieveFinalState ?? false,
                code: 'CURSOR_EXPIRED',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'CURSOR_EXPIRED',
                    sequence: error instanceof StreamEventStoreError ? error.earliestRetainedSequence : undefined,
                    retryable: false,
                    runId: finalState?.runId,
                    status: finalState?.status,
                }),
                error: error.message,
                earliestRetainedSequence: error instanceof StreamEventStoreError ? error.earliestRetainedSequence : undefined,
                lastSequence: finalState?.lastSequence,
                publicFailureMessage: finalState?.publicFailureMessage,
                recoveryUnavailable: true,
                runId: finalState?.runId,
                runStatus: finalState?.status,
                terminalSequence: finalState?.terminalSequence,
            },
            { status: 410 }
        )
    }

    return Response.json(
        {
            code: error.code,
            diagnostics: createSafeStreamDiagnostics({
                retryable: false,
            }),
            error: error.message,
        },
        { status: 400 }
    )
}

function isTerminalRun(run: Pick<StreamRunRecord, 'status' | 'terminalSequence'>) {
    return run.terminalSequence != null || terminalRunStatuses.has(run.status)
}

function hasTerminalEvent(events: StreamEventEnvelopeDto[]) {
    return events.some(event => event.terminal === true)
}

function createLiveReplayStream(input: {
    after: number
    initialReplay: ReplayStreamEventsResult
    ownerSessionHash: string
    runId: string
}): ReadableStream<Uint8Array> {
    let closeRef: (() => void) | undefined

    return new ReadableStream<Uint8Array>({
        async start(controller) {
            const writer = createNdjsonChunkWriter(controller)
            let closed = false
            let polling = false
            let lastSequence = input.after
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null
            let pollTimer: ReturnType<typeof setInterval> | null = null

            const close = () => {
                if (closed) {
                    return
                }

                closed = true
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer)
                    heartbeatTimer = null
                }
                if (pollTimer) {
                    clearInterval(pollTimer)
                    pollTimer = null
                }
                writer.close()
            }
            const fail = (error: unknown) => {
                if (closed) {
                    return
                }

                closed = true
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer)
                    heartbeatTimer = null
                }
                if (pollTimer) {
                    clearInterval(pollTimer)
                    pollTimer = null
                }
                controller.error(error)
            }

            closeRef = close

            const writeEvents = (events: StreamEventEnvelopeDto[]) => {
                for (const event of events) {
                    if (closed) {
                        return
                    }

                    writer.writeEnvelope(event as unknown as StreamEventEnvelope)
                    lastSequence = event.sequence

                    if (event.terminal === true) {
                        close()
                        return
                    }
                }
            }

            const poll = async () => {
                if (closed || polling) {
                    return
                }

                polling = true
                try {
                    const replay = await getStreamEventStore().replayEvents({
                        after: lastSequence,
                        ownerSessionHash: input.ownerSessionHash,
                        runId: input.runId,
                    })

                    writeEvents(replay.events)
                    if (!closed && replay.events.length === 0 && isTerminalRun(replay.run)) {
                        close()
                    }
                } catch (error) {
                    fail(error)
                } finally {
                    polling = false
                }
            }

            writeEvents(input.initialReplay.events)
            if (closed || hasTerminalEvent(input.initialReplay.events) || isTerminalRun(input.initialReplay.run)) {
                close()
                return
            }

            heartbeatTimer = setInterval(() => {
                if (closed) {
                    close()
                    return
                }

                try {
                    writer.writeHeartbeat()
                } catch {
                    close()
                }
            }, streamRecoveryHeartbeatIntervalMs)
            pollTimer = setInterval(() => {
                void poll()
            }, streamRecoveryPollIntervalMs)
        },
        cancel() {
            closeRef?.()
        },
    })
}

export async function GET(request: NextRequest, context: { params: { runId: string } | Promise<{ runId: string }> }) {
    let ownerSessionHash: string | undefined
    let runIdForFinalState: string | undefined

    try {
        const params = await context.params
        const runId = params.runId
        runIdForFinalState = runId
        const cursor = parseCursor(request)

        if (cursor instanceof Response) {
            return cursor
        }

        const { sessionId, setCookie } = resolveSessionId(request.cookies)
        ownerSessionHash = createAgentRunOwnerSessionHash(sessionId)
        await getStreamRunService().validateCursor({
            after: cursor.after,
            ownerSessionHash,
            protocolVersion: 1,
            runId,
        })
        const initialReplay = await getStreamEventStore().replayEvents({
            after: cursor.after,
            ownerSessionHash,
            runId,
        })
        const body = createLiveReplayStream({
            after: cursor.after,
            initialReplay,
            ownerSessionHash,
            runId,
        })

        return new Response(body, {
            headers: createStreamHeaders(setCookie),
        })
    } catch (error) {
        if (error instanceof StreamRunServiceError || error instanceof StreamEventStoreError) {
            const finalState =
                ownerSessionHash && runIdForFinalState && (error.code === 'CURSOR_EXPIRED' || error.code === 'CURSOR_AHEAD')
                    ? await getStreamRunService()
                          .getSafeFinalState({
                              ownerSessionHash,
                              runId: runIdForFinalState,
                          })
                          .catch(() => undefined)
                    : undefined

            return mapRecoveryError(error, finalState)
        }

        // eslint-disable-next-line no-console
        console.error('Stream recovery GET failed:', error)

        return Response.json(
            {
                code: 'STREAM_SERVICE_UNAVAILABLE',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                    retryable: true,
                    runId: runIdForFinalState,
                }),
                error: 'Stream recovery service is temporarily unavailable.',
            },
            { status: 503 }
        )
    }
}
