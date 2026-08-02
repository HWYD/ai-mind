import type { NextRequest } from 'next/server'

import { createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs'
import { resolveSessionId } from '@/lib/ai/rate-limit'
import { ImageGenerationRunRepository } from '@/lib/ai/runtime/image-generation-agent/image-generation-run-repository'
import { createSafeStreamDiagnostics } from '@/lib/ai/stream-recovery/contracts'
import { StreamExecutionCoordinator, StreamExecutionCoordinatorError } from '@/lib/ai/stream-recovery/stream-execution-coordinator'

export const runtime = 'nodejs'

let streamExecutionCoordinator: StreamExecutionCoordinator | undefined

function getStreamExecutionCoordinator() {
    streamExecutionCoordinator ??= new StreamExecutionCoordinator()

    return streamExecutionCoordinator
}

function mapCancelError(error: StreamExecutionCoordinatorError) {
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

    return Response.json(
        {
            code: error.code,
            diagnostics: createSafeStreamDiagnostics({
                retryable: false,
            }),
            error: error.message,
        },
        { status: 409 }
    )
}

export async function POST(request: NextRequest, context: { params: { runId: string } | Promise<{ runId: string }> }) {
    try {
        const params = await context.params
        const runId = params.runId
        const { sessionId, setCookie } = resolveSessionId(request.cookies)
        const ownerSessionHash = createAgentRunOwnerSessionHash(sessionId)
        const run = await getStreamExecutionCoordinator().requestCancel({
            ownerSessionHash,
            runId,
        })

        if (run.kind === 'image_generation') {
            await new ImageGenerationRunRepository().markCancelled(runId)
        }

        const terminal = new Set(['completed', 'failed', 'cancelled', 'rejected', 'version_mismatch']).has(run.status)

        return Response.json(
            {
                cancelRequested: !terminal,
                runId,
                status: terminal ? run.status : 'cancel_requested',
            },
            {
                headers: setCookie ? { 'Set-Cookie': setCookie } : undefined,
            }
        )
    } catch (error) {
        if (error instanceof StreamExecutionCoordinatorError) {
            return mapCancelError(error)
        }

        // eslint-disable-next-line no-console
        console.error('Stream cancel failed:', error)

        return Response.json(
            {
                code: 'STREAM_SERVICE_UNAVAILABLE',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                    retryable: true,
                }),
                error: 'Stream cancel service is temporarily unavailable.',
            },
            { status: 503 }
        )
    }
}
