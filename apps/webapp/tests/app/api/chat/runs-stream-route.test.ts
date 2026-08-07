import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveSessionIdMock = vi.hoisted(() =>
    vi.fn(() => ({
        sessionId: 'test-session',
        setCookie:
            'ai-mind-session-id=test-session; Max-Age=2592000; Expires=Fri, 04 Sep 2026 00:00:00 GMT; HttpOnly; SameSite=Lax; Path=/',
    }))
)
const streamRunMocks = vi.hoisted(() => {
    class MockStreamRunServiceError extends Error {
        readonly code: string

        constructor(code: string, message: string) {
            super(message)
            this.name = 'StreamRunServiceError'
            this.code = code
        }
    }

    return {
        getSafeFinalStateMock: vi.fn(),
        MockStreamRunServiceError,
        validateCursorMock: vi.fn(),
    }
})
const streamEventMocks = vi.hoisted(() => {
    class MockStreamEventStoreError extends Error {
        readonly code: string

        constructor(code: string, message: string) {
            super(message)
            this.name = 'StreamEventStoreError'
            this.code = code
        }
    }

    return {
        MockStreamEventStoreError,
        replayEventsMock: vi.fn(),
    }
})

vi.mock('@/lib/ai/rate-limit', () => ({
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/stream-recovery/stream-run-service', () => ({
    StreamRunService: class StreamRunServiceMock {
        getSafeFinalState = streamRunMocks.getSafeFinalStateMock
        validateCursor = streamRunMocks.validateCursorMock
    },
    StreamRunServiceError: streamRunMocks.MockStreamRunServiceError,
}))

vi.mock('@/lib/ai/stream-recovery/stream-event-store', () => ({
    StreamEventStore: class StreamEventStoreMock {
        replayEvents = streamEventMocks.replayEventsMock
    },
    StreamEventStoreError: streamEventMocks.MockStreamEventStoreError,
}))

import { GET } from '@/app/api/chat/runs/[runId]/stream/route'

function createGetRequest(url = 'http://localhost:3000/api/chat/runs/run_1/stream?after=1', headers: Record<string, string> = {}) {
    return new NextRequest(url, {
        headers,
        method: 'GET',
    })
}

async function readNextTextChunk(response: Response) {
    const reader = response.body?.getReader()

    if (!reader) {
        return ''
    }

    const next = await reader.read()
    await reader.cancel()

    return next.value ? new TextDecoder().decode(next.value) : ''
}

describe('GET /api/chat/runs/[runId]/stream', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        streamRunMocks.validateCursorMock.mockResolvedValue({
            id: 'run_1',
            lastSequence: 2,
            ownerSessionHash: 'a'.repeat(64),
            status: 'running',
        })
        streamRunMocks.getSafeFinalStateMock.mockResolvedValue({
            canRestart: true,
            canRetrieveFinalState: true,
            lastSequence: 2,
            runId: 'run_1',
            status: 'failed',
            terminalSequence: 2,
        })
        streamEventMocks.replayEventsMock.mockResolvedValue({
            events: [
                {
                    eventId: 'evt_2',
                    eventKind: 'chunk',
                    payload: {
                        delta: 'hello',
                        partId: 'answer',
                        type: 'text-delta',
                    },
                    protocolVersion: 1,
                    runId: 'run_1',
                    sequence: 2,
                },
            ],
            run: {
                id: 'run_1',
                status: 'running',
                terminalSequence: null,
            },
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('replays retained events after cursor as resumable NDJSON', async () => {
        const response = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })
        const body = await readNextTextChunk(response)

        expect(response.status).toBe(200)
        expect(response.headers.get('Content-Type')).toBe('application/x-ndjson; profile="ai-mind-resumable-v1"')
        expect(response.headers.get('X-Accel-Buffering')).toBe('no')
        expect(response.headers.get('Set-Cookie')).toContain('ai-mind-session-id=test-session')
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=2592000')
        expect(body).toBe(
            '{"eventId":"evt_2","eventKind":"chunk","payload":{"delta":"hello","partId":"answer","type":"text-delta"},"protocolVersion":1,"runId":"run_1","sequence":2}\n'
        )
        expect(streamRunMocks.validateCursorMock).toHaveBeenCalledWith(
            expect.objectContaining({
                after: 1,
                ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                runId: 'run_1',
            })
        )
        expect(streamEventMocks.replayEventsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                after: 1,
                ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                runId: 'run_1',
            })
        )
    })

    it('accepts Last-Event-ID as cursor and rejects mismatched cursor forms', async () => {
        await GET(createGetRequest('http://localhost:3000/api/chat/runs/run_1/stream', { 'Last-Event-ID': '2' }), {
            params: Promise.resolve({ runId: 'run_1' }),
        })

        expect(streamRunMocks.validateCursorMock).toHaveBeenLastCalledWith(expect.objectContaining({ after: 2 }))

        const response = await GET(createGetRequest('http://localhost:3000/api/chat/runs/run_1/stream?after=1', { 'Last-Event-ID': '2' }), {
            params: { runId: 'run_1' },
        })
        const body = await response.json()

        expect(response.status).toBe(400)
        expect(body).toMatchObject({
            code: 'INVALID_CURSOR',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'INVALID_CURSOR',
                retryable: false,
            }),
        })
    })

    it('maps ownership and missing run errors to safe public responses', async () => {
        streamRunMocks.validateCursorMock.mockRejectedValueOnce(
            new streamRunMocks.MockStreamRunServiceError('STREAM_RUN_FORBIDDEN', 'forbidden')
        )

        const forbidden = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })
        const forbiddenBody = await forbidden.json()

        expect(forbidden.status).toBe(403)
        expect(forbiddenBody).toMatchObject({
            code: 'STREAM_RUN_FORBIDDEN',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'STREAM_RUN_FORBIDDEN',
                retryable: false,
            }),
            error: 'Stream run was not found for the current browser session.',
        })

        streamRunMocks.validateCursorMock.mockRejectedValueOnce(
            new streamRunMocks.MockStreamRunServiceError('STREAM_RUN_NOT_FOUND', 'missing')
        )
        const missing = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })

        expect(missing.status).toBe(404)
        await expect(missing.json()).resolves.toMatchObject({
            code: 'STREAM_RUN_NOT_FOUND',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'STREAM_RUN_NOT_FOUND',
                retryable: false,
            }),
        })
    })

    it('maps cursor ahead and expired errors to permanent recovery responses', async () => {
        streamRunMocks.validateCursorMock.mockRejectedValueOnce(
            new streamRunMocks.MockStreamRunServiceError('CURSOR_AHEAD', 'Cursor is ahead.')
        )
        const ahead = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })

        expect(ahead.status).toBe(409)
        await expect(ahead.json()).resolves.toMatchObject({
            canRestart: false,
            code: 'CURSOR_AHEAD',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'CURSOR_AHEAD',
                retryable: false,
                runId: 'run_1',
                status: 'failed',
            }),
            runId: 'run_1',
        })

        streamEventMocks.replayEventsMock.mockRejectedValueOnce(
            new streamEventMocks.MockStreamEventStoreError('CURSOR_EXPIRED', 'Cursor is expired.')
        )
        const expired = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })

        expect(expired.status).toBe(410)
        await expect(expired.json()).resolves.toMatchObject({
            canRestart: true,
            canRetrieveFinalState: true,
            code: 'CURSOR_EXPIRED',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'CURSOR_EXPIRED',
                retryable: false,
                runId: 'run_1',
                status: 'failed',
            }),
            recoveryUnavailable: true,
            lastSequence: 2,
            runId: 'run_1',
            runStatus: 'failed',
        })
    })

    it('replays terminal events and closes the response body', async () => {
        streamEventMocks.replayEventsMock.mockResolvedValueOnce({
            events: [
                {
                    eventId: 'evt_done',
                    eventKind: 'terminal',
                    payload: {
                        type: 'finish',
                    },
                    protocolVersion: 1,
                    runId: 'run_1',
                    runStatus: 'completed',
                    sequence: 3,
                    terminal: true,
                    terminalState: 'completed',
                },
            ],
            run: {
                id: 'run_1',
                status: 'completed',
                terminalSequence: 3,
            },
        })

        const response = await GET(createGetRequest('http://localhost:3000/api/chat/runs/run_1/stream?after=2'), {
            params: { runId: 'run_1' },
        })

        await expect(response.text()).resolves.toBe(
            '{"eventId":"evt_done","eventKind":"terminal","payload":{"type":"finish"},"protocolVersion":1,"runId":"run_1","runStatus":"completed","sequence":3,"terminal":true,"terminalState":"completed"}\n'
        )
    })

    it('keeps the replay response live and polls for new events after the cursor', async () => {
        vi.useFakeTimers()
        streamEventMocks.replayEventsMock
            .mockResolvedValueOnce({
                events: [],
                run: {
                    id: 'run_1',
                    status: 'running',
                    terminalSequence: null,
                },
            })
            .mockResolvedValueOnce({
                events: [
                    {
                        eventId: 'evt_2',
                        eventKind: 'chunk',
                        payload: {
                            delta: 'live',
                            partId: 'answer',
                            type: 'text-delta',
                        },
                        protocolVersion: 1,
                        runId: 'run_1',
                        sequence: 2,
                    },
                ],
                run: {
                    id: 'run_1',
                    status: 'running',
                    terminalSequence: null,
                },
            })

        const response = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })
        const reader = response.body?.getReader()
        const liveRead = reader?.read()

        await vi.advanceTimersByTimeAsync(500)

        await expect(liveRead).resolves.toMatchObject({
            done: false,
            value: new TextEncoder().encode(
                '{"eventId":"evt_2","eventKind":"chunk","payload":{"delta":"live","partId":"answer","type":"text-delta"},"protocolVersion":1,"runId":"run_1","sequence":2}\n'
            ),
        })
        expect(streamEventMocks.replayEventsMock).toHaveBeenLastCalledWith(
            expect.objectContaining({
                after: 1,
                runId: 'run_1',
            })
        )

        await reader?.cancel()
    })

    it('writes transparent heartbeat while waiting for live recovery events', async () => {
        vi.useFakeTimers()
        streamEventMocks.replayEventsMock.mockResolvedValue({
            events: [],
            run: {
                id: 'run_1',
                status: 'running',
                terminalSequence: null,
            },
        })

        const response = await GET(createGetRequest(), {
            params: { runId: 'run_1' },
        })
        const reader = response.body?.getReader()
        const heartbeatRead = reader?.read()

        await vi.advanceTimersByTimeAsync(15_000)

        await expect(heartbeatRead).resolves.toMatchObject({
            done: false,
            value: new TextEncoder().encode('\n'),
        })

        await reader?.cancel()
    })
})
