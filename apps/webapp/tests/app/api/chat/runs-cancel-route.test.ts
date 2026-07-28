import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveSessionIdMock = vi.hoisted(() => vi.fn(() => ({ sessionId: 'test-session', setCookie: 'sid=test-session' })))
const coordinatorMocks = vi.hoisted(() => {
    class MockStreamExecutionCoordinatorError extends Error {
        readonly code: string

        constructor(code: string, message: string) {
            super(message)
            this.name = 'StreamExecutionCoordinatorError'
            this.code = code
        }
    }

    return {
        MockStreamExecutionCoordinatorError,
        requestCancelMock: vi.fn(),
    }
})
const projectorMocks = vi.hoisted(() => {
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
        projectLifecycleMock: vi.fn(),
    }
})

vi.mock('@/lib/ai/rate-limit', () => ({
    resolveSessionId: resolveSessionIdMock,
}))

vi.mock('@/lib/ai/stream-recovery/stream-execution-coordinator', () => ({
    StreamExecutionCoordinator: class StreamExecutionCoordinatorMock {
        requestCancel = coordinatorMocks.requestCancelMock
    },
    StreamExecutionCoordinatorError: coordinatorMocks.MockStreamExecutionCoordinatorError,
}))

vi.mock('@/lib/ai/stream-recovery/stream-event-projector', () => ({
    StreamEventProjector: class StreamEventProjectorMock {
        projectLifecycle = projectorMocks.projectLifecycleMock
    },
}))

vi.mock('@/lib/ai/stream-recovery/stream-event-store', () => ({
    StreamEventStoreError: projectorMocks.MockStreamEventStoreError,
}))

import { POST } from '@/app/api/chat/runs/[runId]/cancel/route'

function createCancelRequest() {
    return new NextRequest('http://localhost:3000/api/chat/runs/run_1/cancel', {
        method: 'POST',
    })
}

describe('POST /api/chat/runs/[runId]/cancel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.AI_MIND_AGENT_RUN_SESSION_SECRET = 'test-secret-with-at-least-32-characters'
        coordinatorMocks.requestCancelMock.mockResolvedValue({
            id: 'run_1',
            status: 'running',
        })
        projectorMocks.projectLifecycleMock.mockResolvedValue({
            eventId: 'evt_cancelled',
            eventKind: 'terminal',
            payload: {
                status: 'cancelled',
                type: 'run-status',
            },
            protocolVersion: 1,
            runId: 'run_1',
            sequence: 3,
            terminal: true,
            terminalState: 'cancelled',
        })
    })

    it('records explicit cancel intent and returns the pending public status', async () => {
        const response = await POST(createCancelRequest(), {
            params: { runId: 'run_1' },
        })

        await expect(response.json()).resolves.toEqual({
            cancelRequested: true,
            runId: 'run_1',
            status: 'cancel_requested',
        })
        expect(response.headers.get('Set-Cookie')).toBe('sid=test-session')
        expect(coordinatorMocks.requestCancelMock).toHaveBeenCalledWith(
            expect.objectContaining({
                ownerSessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
                runId: 'run_1',
            })
        )
        expect(projectorMocks.projectLifecycleMock).not.toHaveBeenCalled()
    })

    it('treats already-terminal cancel projection as idempotent', async () => {
        coordinatorMocks.requestCancelMock.mockResolvedValueOnce({
            id: 'run_1',
            status: 'cancelled',
        })

        const response = await POST(createCancelRequest(), {
            params: Promise.resolve({ runId: 'run_1' }),
        })

        await expect(response.json()).resolves.toMatchObject({ cancelRequested: false, runId: 'run_1', status: 'cancelled' })
    })

    it('maps ownership and missing run errors without exposing event content', async () => {
        coordinatorMocks.requestCancelMock.mockRejectedValueOnce(
            new coordinatorMocks.MockStreamExecutionCoordinatorError('STREAM_RUN_FORBIDDEN', 'forbidden')
        )

        const forbidden = await POST(createCancelRequest(), {
            params: { runId: 'run_1' },
        })

        expect(forbidden.status).toBe(403)
        await expect(forbidden.json()).resolves.toMatchObject({
            code: 'STREAM_RUN_FORBIDDEN',
            diagnostics: expect.objectContaining({
                diagnosticId: expect.any(String),
                errorCode: 'STREAM_RUN_FORBIDDEN',
                retryable: false,
            }),
            error: 'Stream run was not found for the current browser session.',
        })

        coordinatorMocks.requestCancelMock.mockRejectedValueOnce(
            new coordinatorMocks.MockStreamExecutionCoordinatorError('STREAM_RUN_NOT_FOUND', 'missing')
        )

        const missing = await POST(createCancelRequest(), {
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
})
