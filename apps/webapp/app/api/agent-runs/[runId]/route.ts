import { type NextRequest } from 'next/server'

import { AgentRunService, AgentRunServiceError } from '@/lib/ai/agent-runs'
import type { AgentRunApiErrorCode } from '@/lib/ai/agent-runs/contracts'
import { resolveSessionId } from '@/lib/ai/rate-limit'

export const runtime = 'nodejs'

type AgentRunRouteContext = {
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

async function resolveRunId(context: AgentRunRouteContext) {
    const params = await context.params

    return params.runId
}

function jsonWithOptionalCookie(body: unknown, status: number, setCookie?: string | null) {
    const headers = setCookie ? { 'Set-Cookie': setCookie } : undefined

    return Response.json(body, { headers, status })
}

function toAgentRunErrorResponse(error: AgentRunServiceError, setCookie?: string | null) {
    return jsonWithOptionalCookie(
        {
            code: error.code,
            error: error.message,
        },
        agentRunErrorStatusMap[error.code],
        setCookie
    )
}

function logUnexpectedQueryError(runId: string | undefined, error: unknown) {
    // 不记录 raw Error，避免把 decision / draft 正文写入日志。
    // eslint-disable-next-line no-console
    console.error('AgentRun query API error:', {
        errorCode: 'AGENT_RESUME_FAILED',
        errorName: error instanceof Error ? error.name : typeof error,
        runId: runId ?? 'unknown',
        stage: 'query-route',
    })
}

export async function GET(request: NextRequest, context: AgentRunRouteContext) {
    const { sessionId, setCookie } = resolveSessionId(request.cookies)
    let requestRunId: string | undefined

    try {
        const agentRunService = new AgentRunService()
        const runId = await resolveRunId(context)
        requestRunId = runId
        // v0.3.0 前端不再用这个接口做刷新后的 pending HITL 恢复；
        // 这里保留 AgentRun 查询能力，供后续版本在“同消息重建 + 会话恢复”真正补齐时复用。
        const run = await agentRunService.getOwnedRun(sessionId, runId)

        return jsonWithOptionalCookie(run, 200, setCookie)
    } catch (error) {
        if (error instanceof AgentRunServiceError) {
            return toAgentRunErrorResponse(error, setCookie)
        }

        logUnexpectedQueryError(requestRunId, error)

        return jsonWithOptionalCookie(
            {
                code: 'AGENT_RESUME_FAILED',
                error: 'AgentRun query failed.',
            },
            500,
            setCookie
        )
    }
}
