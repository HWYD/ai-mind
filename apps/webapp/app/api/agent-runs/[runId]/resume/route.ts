import { type NextRequest } from 'next/server'
import { z, ZodError } from 'zod'

import { AgentRunService, AgentRunServiceError, createAgentRunOwnerSessionHash } from '@/lib/ai/agent-runs'
import type { AgentRunApiErrorCode } from '@/lib/ai/agent-runs/contracts'
import { createChatService } from '@/lib/ai/chat-service'
import { ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider/catalog/resolve-model-selection'
import { resolveSessionId } from '@/lib/ai/rate-limit'
import { createTasklistAgentModelSet, getTasklistAgentRuntimeConfig } from '@/lib/ai/runtime/version-plan-tasklist-agent'
import { createSafeStreamDiagnostics, RESUMABLE_STREAM_ACCEPT } from '@/lib/ai/stream-recovery/contracts'
import { StreamEventProjector } from '@/lib/ai/stream-recovery/stream-event-projector'
import { StreamEventStoreError } from '@/lib/ai/stream-recovery/stream-event-store'

export const runtime = 'nodejs'

const chatService = createChatService()
let streamEventProjector: StreamEventProjector | undefined

const resumeRequestSchema = z
    .object({
        decision: z.unknown(),
        interruptId: z.string().trim().min(1),
    })
    .strict()

type AgentRunResumeRouteContext = {
    params: Promise<{ runId: string }> | { runId: string }
}

const agentRunErrorStatusMap: Record<AgentRunApiErrorCode, number> = {
    AGENT_INTERRUPT_NOT_PENDING: 409,
    AGENT_RESUME_FAILED: 500,
    AGENT_RUN_FORBIDDEN: 403,
    AGENT_RUN_NOT_FOUND: 404,
    AGENT_RUN_NOT_PAUSED: 409,
    AGENT_RUN_VERSION_MISMATCH: 409,
    INVALID_AGENT_REVIEW_DECISION: 400,
}

async function resolveRunId(context: AgentRunResumeRouteContext) {
    const params = await context.params

    return params.runId
}

function jsonWithOptionalCookie(body: unknown, status: number, setCookie?: string | null) {
    const headers = setCookie ? { 'Set-Cookie': setCookie } : undefined

    return Response.json(body, { headers, status })
}

function isRejectDecision(decision: unknown): decision is { reason?: string; type: 'reject' } {
    return typeof decision === 'object' && decision !== null && 'type' in decision && decision.type === 'reject'
}

function buildRejectSummary(interruptKind: string, reason?: string) {
    const baseSummary =
        interruptKind === 'tasklist_revision_review'
            ? '已终止本轮 tasklist 生成。当前 draft 不会继续修订，也不会输出最终 artifact。'
            : '已终止本轮 tasklist 生成。当前策略不会继续执行。'

    return reason?.trim() ? `${baseSummary}\n\n终止原因：${reason.trim()}` : baseSummary
}

function toAgentRunErrorResponse(error: AgentRunServiceError, runId: string | undefined, setCookie?: string | null) {
    return jsonWithOptionalCookie(
        {
            code: error.code,
            diagnostics: createSafeStreamDiagnostics({
                errorCode: error.code === 'AGENT_RUN_VERSION_MISMATCH' ? 'AGENT_RUN_VERSION_MISMATCH' : undefined,
                retryable: error.code === 'AGENT_RESUME_FAILED',
                ...(runId ? { runId } : {}),
            }),
            error: error.message,
        },
        agentRunErrorStatusMap[error.code],
        setCookie
    )
}

function withResumableStreamHeaders(response: Response, runId: string) {
    const headers = new Headers(response.headers)

    headers.set('Content-Type', RESUMABLE_STREAM_ACCEPT)
    headers.set('X-Run-Id', runId)
    headers.set('X-Stream-Protocol', 'ai-mind-resumable-v1')

    return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
    })
}

function getStreamEventProjector() {
    streamEventProjector ??= new StreamEventProjector()

    return streamEventProjector
}

async function projectVersionMismatchTerminal(runId: string, ownerSessionHash: string, message: string) {
    try {
        await getStreamEventProjector().projectLifecycle({
            agentRunId: runId,
            code: 'AGENT_RUN_VERSION_MISMATCH',
            message,
            ownerSessionHash,
            runId,
            status: 'version_mismatch',
        })
    } catch (error) {
        if (error instanceof StreamEventStoreError && ['STREAM_RUN_NOT_FOUND', 'STREAM_RUN_TERMINAL'].includes(error.code)) {
            return
        }

        logUnexpectedResumeError(runId, error)
    }
}

function logUnexpectedResumeError(runId: string | undefined, error: unknown) {
    // 不记录 decision / draft 正文，只保留运维定位需要的白名单字段。
    // eslint-disable-next-line no-console
    console.error('AgentRun resume API error:', {
        errorCode: 'AGENT_RESUME_FAILED',
        errorName: error instanceof Error ? error.name : typeof error,
        runId: runId ?? 'unknown',
        stage: 'resume-route',
    })
}

export async function POST(request: NextRequest, context: AgentRunResumeRouteContext) {
    const { sessionId, setCookie } = resolveSessionId(request.cookies)
    const ownerSessionHash = createAgentRunOwnerSessionHash(sessionId)
    let agentRunService: AgentRunService | undefined
    let requestRunId: string | undefined
    let resumedRunId: string | undefined

    try {
        agentRunService = new AgentRunService()
        const runId = await resolveRunId(context)
        requestRunId = runId
        const body = resumeRequestSchema.parse(await request.json())

        if (isRejectDecision(body.decision)) {
            const preparedResume = await agentRunService.beginResume({
                decision: body.decision,
                interruptId: body.interruptId,
                runId,
                sessionId,
            })
            resumedRunId = runId
            await agentRunService.markRejected(runId)

            const response = await chatService.rejectAgentRun(
                {
                    assistantMessageId: preparedResume.run.assistantMessageId,
                    interruptId: preparedResume.interrupt.interruptId,
                    runId,
                    summary: buildRejectSummary(preparedResume.interrupt.interruptKind, body.decision.reason),
                    threadId: preparedResume.threadId,
                },
                {
                    sessionId,
                    setCookie,
                    signal: undefined,
                    streamRecovery: {
                        ownerSessionHash,
                        requestSignal: request.signal,
                        runId,
                    },
                }
            )

            return withResumableStreamHeaders(response, runId)
        }

        const executionMetadata = await agentRunService.getOwnedRunExecutionMetadata(sessionId, runId)
        const resolvedModelSelection = resolveModelSelection({
            modelId: executionMetadata.modelId,
            routeType: 'tasklist',
        })
        const models = createTasklistAgentModelSet({
            enableReasoning: executionMetadata.reasoningEnabled,
            resolvedModelSelection,
        })
        const runtimeConfig = getTasklistAgentRuntimeConfig()
        const preparedResume = await agentRunService.beginResume({
            decision: body.decision,
            interruptId: body.interruptId,
            runId,
            sessionId,
        })
        resumedRunId = runId

        const response = await chatService.resumeAgentRun(
            {
                agentRunService,
                decision: preparedResume.decision,
                interruptId: body.interruptId,
                models,
                preparedResume,
                runId,
                runtimeConfig,
                userGoal: executionMetadata.userGoalSummary,
            },
            {
                resolvedModelSelection,
                sessionId,
                setCookie,
                signal: undefined,
                streamRecovery: {
                    ownerSessionHash,
                    requestSignal: request.signal,
                    runId,
                },
            }
        )

        return withResumableStreamHeaders(response, runId)
    } catch (error) {
        if (error instanceof ZodError) {
            return jsonWithOptionalCookie(
                {
                    code: 'INVALID_AGENT_REVIEW_DECISION',
                    diagnostics: createSafeStreamDiagnostics({
                        errorCode: 'INVALID_AGENT_REVIEW_DECISION',
                        retryable: false,
                        ...(requestRunId ? { runId: requestRunId } : {}),
                    }),
                    error: 'Invalid AgentRun resume request.',
                    issues: error.issues,
                },
                400,
                setCookie
            )
        }

        if (error instanceof AgentRunServiceError) {
            if (error.code === 'AGENT_RUN_VERSION_MISMATCH' && requestRunId) {
                await projectVersionMismatchTerminal(requestRunId, ownerSessionHash, error.message)
            }

            return toAgentRunErrorResponse(error, requestRunId, setCookie)
        }

        if (resumedRunId && agentRunService) {
            await agentRunService
                .markFailed(resumedRunId, 'TASKLIST_AGENT_RESUME_FAILED', 'Tasklist Agent resume failed before stream started.')
                .catch(() => undefined)
        }

        if (error instanceof ModelSelectionError) {
            return jsonWithOptionalCookie(
                {
                    code: error.code,
                    error: error.message,
                    modelId: error.modelId,
                    diagnostics: createSafeStreamDiagnostics({
                        errorCode: 'INVALID_AGENT_REVIEW_DECISION',
                        retryable: false,
                        ...(requestRunId ? { runId: requestRunId } : {}),
                    }),
                },
                400,
                setCookie
            )
        }

        logUnexpectedResumeError(requestRunId ?? resumedRunId, error)

        return jsonWithOptionalCookie(
            {
                code: 'AGENT_RESUME_FAILED',
                diagnostics: createSafeStreamDiagnostics({
                    errorCode: 'AGENT_RESUME_FAILED',
                    retryable: false,
                    ...((requestRunId ?? resumedRunId) ? { runId: requestRunId ?? resumedRunId } : {}),
                }),
                error: 'AgentRun resume failed.',
            },
            500,
            setCookie
        )
    }
}
