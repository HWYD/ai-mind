import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'

import { InputLengthExceededError } from '@/lib/ai/model-provider'

export { createStreamErrorChunk, writeStreamErrorChunk, type StreamErrorPayload } from '@ai-mind/stream-core'

export interface NormalizedKnownRuntimeError {
    code: StreamErrorCode
    message: string
    retryable: boolean
}

function getErrorCode(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : undefined
}

function getErrorName(error: unknown) {
    return error instanceof Error ? error.name : undefined
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function sanitizeRuntimeErrorMessage(message: string) {
    return message
        .replace(/sk-[a-zA-Z0-9_-]{8,}/g, '[REDACTED]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/postgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@/gi, 'postgresql://[REDACTED]@')
        .slice(0, 500)
}

function normalizePrismaDataLayerError(error: unknown): NormalizedKnownRuntimeError | null {
    const message = getErrorMessage(error)
    const code = getErrorCode(error)
    const name = getErrorName(error)

    if (message.includes('AI_MIND_AGENT_RUN_SESSION_SECRET must contain at least 32 characters.')) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message:
                'Tasklist Agent 运行时未完成配置：请在 apps/webapp/.env.local 中设置至少 32 位的 AI_MIND_AGENT_RUN_SESSION_SECRET，并重启 WebApp 后重试。',
            retryable: false,
        }
    }

    if (
        message.includes('Tasklist Agent requires an owned chat session.') ||
        message.includes('A non-empty sessionId is required for AgentRun ownership.')
    ) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: 'Tasklist Agent 会话状态不可用：请刷新页面后重试；如果仍然失败，请检查本地会话 / Cookie 配置。',
            retryable: true,
        }
    }

    if (message.includes('DATABASE_URL is required')) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: 'Tasklist Agent 数据库未配置：请设置 DATABASE_URL，并启动 PostgreSQL / 执行 Prisma migration 后重试。',
            retryable: false,
        }
    }

    if (
        code === 'P2021' ||
        message.includes('does not exist in the current database') ||
        message.includes('schema "langgraph_checkpoint" does not exist') ||
        message.includes('relation "langgraph_checkpoint.checkpoints" does not exist') ||
        message.includes('relation "langgraph_checkpoint.checkpoint_blobs" does not exist') ||
        message.includes('relation "langgraph_checkpoint.checkpoint_migrations" does not exist') ||
        message.includes('relation "langgraph_checkpoint.checkpoint_writes" does not exist') ||
        message.includes('relation "agent_runs" does not exist') ||
        message.includes('relation "agent_interrupts" does not exist')
    ) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: message.includes('langgraph_checkpoint')
                ? 'Tasklist Agent durable checkpoint 未初始化：请执行 `pnpm --dir apps/webapp db:checkpoint:setup` 后重试。'
                : 'Tasklist Agent 数据库结构未就绪：请确认已执行 Prisma migration 后重试。',
            retryable: false,
        }
    }

    if (
        name?.startsWith('Prisma') ||
        code?.startsWith('P') ||
        message.includes("Can't reach database") ||
        message.includes('ECONNREFUSED') ||
        message.includes('database') ||
        message.includes('Prisma')
    ) {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: 'Tasklist Agent 数据库暂时不可用：请确认 PostgreSQL、DATABASE_URL 和 Prisma Client 状态后重试。',
            retryable: true,
        }
    }

    return null
}

export function normalizeKnownRuntimeError(error: unknown): NormalizedKnownRuntimeError | null {
    const code = getErrorCode(error)
    const name = getErrorName(error)

    if (error instanceof InputLengthExceededError || (name === 'InputLengthExceededError' && code === 'MODEL_PROVIDER_INVALID_REQUEST')) {
        return {
            code: 'MODEL_PROVIDER_INVALID_REQUEST',
            message: '请求内容超出模型处理上限，请缩短输入后重试。',
            retryable: false,
        }
    }

    if (name === 'AgentRunServiceError' || code?.startsWith('AGENT_') || code === 'INVALID_AGENT_REVIEW_DECISION') {
        return {
            code: 'RUNTIME_INVARIANT_FAILED',
            message: sanitizeRuntimeErrorMessage(getErrorMessage(error)),
            retryable: code === 'AGENT_RESUME_FAILED',
        }
    }

    return normalizePrismaDataLayerError(error)
}

export function isControllerClosedError(error: unknown): boolean {
    return error instanceof TypeError && error.message.includes('Controller is already closed')
}

export function logChatCancellation(reason: string) {
    // eslint-disable-next-line no-console
    console.info(`[chat] stream cancelled: ${reason}`)
}

export function logSkillRuntime(event: string, payload: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') {
        return
    }

    // eslint-disable-next-line no-console
    console.info(`[skill-runtime] ${event}`, payload)
}

export function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
    }
}
