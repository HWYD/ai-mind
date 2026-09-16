import type { StreamErrorStage } from '@ai-mind/stream-core/protocol'
import { type ToolCall, ToolMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import { isAbortError } from '@/lib/ai/error-utils'
import { type ToolExecutionPolicy, toolExecutionProfiles, type ToolRuntimeScope, toolSupportsRuntimeScope } from '@/lib/ai/tools'

import { throwIfAborted, writeStreamErrorChunk } from '../stream-errors'
import type { ChatExecutionContext, ExecutedToolResult, ToolValidationError, WriteChunk } from '../types'
import {
    formatToolExecutionOutput,
    formatToolInput,
    formatToolPublicOutput,
    getResourceDisplayFields,
    getResourceResultFields,
    getToolDisplayFields,
    type ResourceDisplayFields,
    type ToolDefinitionMap,
    type ToolDisplayFields,
} from './display'
import { normalizeAndValidateToolCall } from './validation'

export type ToolExecutionFailureCategory = 'connection' | 'invalid-request' | 'permission' | 'rate-limit' | 'server' | 'timeout' | 'unknown'

export interface NormalizedToolExecutionError {
    category: ToolExecutionFailureCategory
    message: string
    retryAfterMs?: number
    retryable: boolean
}

interface ToolRetryPermitPool {
    tryAcquire(request: { callId: string; retryOrdinal: 1 | 2 }): unknown | null
}

export interface ExecuteToolCallOptions {
    actionDeadlineAtMs?: number
    errorStage?: StreamErrorStage
    hardDeadlineAtMs?: number
    retryPermitPool?: ToolRetryPermitPool
    runtimeScope?: ToolRuntimeScope
    toolDefinitionMap: ToolDefinitionMap
    // 仅供先完成额外安全/授权策略的上层 adapter 使用，避免重复 normalize/schema 边界。
    validatedInput?: boolean
}

interface ResolveToolAttemptTimeoutOptions {
    actionDeadlineAtMs?: number
    hardDeadlineAtMs?: number
    nowMs: number
}

interface ToolExecutionErrorOptions {
    displayFields: ToolDisplayFields
    input: string
    message: string
    partId: string
    resourceDisplayFields?: ResourceDisplayFields
    retryable: boolean
    stage?: StreamErrorStage
    toolCall: ToolCall
    writeChunk: WriteChunk
}

interface ToolValidationErrorWriteOptions {
    emitTranscript?: boolean
    stage?: StreamErrorStage
    writeChunk: WriteChunk
}

class ToolAttemptTimeoutError extends Error {
    constructor() {
        super('工具执行超时。')
        this.name = 'ToolAttemptTimeoutError'
    }
}

function shouldEmitPublicToolTranscript(runtimeScope?: ToolRuntimeScope) {
    return runtimeScope !== 'delivery-chain-manager'
}

function getFiniteNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getErrorRecord(error: unknown): Record<string, unknown> {
    return error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
}

function normalizeRetryAfterMs(value: unknown) {
    const retryAfterMs = getFiniteNumber(value)
    return retryAfterMs !== undefined && retryAfterMs >= 1000 && retryAfterMs <= 10000 ? Math.floor(retryAfterMs) : undefined
}

export function normalizeToolExecutionError(error: unknown): NormalizedToolExecutionError {
    if (error instanceof ToolAttemptTimeoutError) {
        return {
            category: 'timeout',
            message: error.message,
            retryable: true,
        }
    }

    const errorRecord = getErrorRecord(error)
    const status = getFiniteNumber(errorRecord.status ?? errorRecord.statusCode)
    const code = typeof errorRecord.code === 'string' ? errorRecord.code.toUpperCase() : ''
    const message = error instanceof Error && error.message ? error.message : '工具执行失败。'
    const retryAfterMs = normalizeRetryAfterMs(errorRecord.retryAfterMs)

    if (code === 'WEB_CONNECTION_ERROR') {
        return { category: 'connection', message, retryAfterMs, retryable: true }
    }

    if (status === 429 || code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS') {
        return { category: 'rate-limit', message, retryAfterMs, retryable: true }
    }

    if (status !== undefined && status >= 500 && status <= 599) {
        return { category: 'server', message, retryAfterMs, retryable: true }
    }

    if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code) || (error instanceof DOMException && error.name === 'TimeoutError')) {
        return { category: 'timeout', message, retryAfterMs, retryable: true }
    }

    if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(code)) {
        return { category: 'connection', message, retryAfterMs, retryable: true }
    }

    if (status === 401 || status === 403) {
        return { category: 'permission', message, retryable: false }
    }

    if (status !== undefined && status >= 400 && status <= 499) {
        return { category: 'invalid-request', message, retryable: false }
    }

    return { category: 'unknown', message, retryable: false }
}

export function resolveToolRetryDelayMs(error: NormalizedToolExecutionError, retryOrdinal: 1 | 2, randomValue = Math.random()) {
    if (error.retryAfterMs !== undefined) {
        return error.retryAfterMs
    }

    const baseDelayMs = retryOrdinal === 1 ? 1000 : 2000
    const boundedRandomValue = Math.min(Math.max(randomValue, 0), 0.999999)

    return baseDelayMs + Math.floor(baseDelayMs * boundedRandomValue)
}

export function resolveToolAttemptTimeoutMs(policy: ToolExecutionPolicy, options: ResolveToolAttemptTimeoutOptions): number | null {
    if (policy.kind === 'agent-tool') {
        return null
    }

    const profileTimeoutMs = toolExecutionProfiles[policy.profile].maxAttemptTimeoutMs
    const actionRemainingMs =
        options.actionDeadlineAtMs === undefined ? Number.POSITIVE_INFINITY : options.actionDeadlineAtMs - options.nowMs
    const hardRemainingMs = options.hardDeadlineAtMs === undefined ? Number.POSITIVE_INFINITY : options.hardDeadlineAtMs - options.nowMs

    return Math.max(
        0,
        Math.floor(Math.min(profileTimeoutMs, policy.attemptTimeoutMs ?? profileTimeoutMs, actionRemainingMs, hardRemainingMs))
    )
}

/** LangChain tool_call invoke 可能返回 ToolMessage，这里只提取业务 payload。 */
function extractToolResultPayload(result: unknown) {
    if (!ToolMessage.isInstance(result)) {
        return result
    }

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content)

    try {
        return JSON.parse(content) as unknown
    } catch {
        return content
    }
}

async function writeToolExecutionError(options: ToolExecutionErrorOptions) {
    const resourceServerId = options.displayFields.serverId ?? 'mcp-resource'

    if (options.displayFields.outputPartType === 'resource' && options.resourceDisplayFields) {
        await writeStreamErrorChunk(options.writeChunk, {
            scope: 'resource',
            errorCode: 'TOOL_EXECUTION_FAILED',
            retryable: options.retryable,
            message: options.message,
            stage: options.stage,
            partId: options.partId,
            resourceName: options.resourceDisplayFields.resourceName,
            uri: options.resourceDisplayFields.uri,
            source: options.displayFields.source,
            location: options.displayFields.location,
            serverId: resourceServerId,
        })
        return
    }

    await writeStreamErrorChunk(options.writeChunk, {
        scope: 'tool',
        errorCode: 'TOOL_EXECUTION_FAILED',
        retryable: options.retryable,
        message: options.message,
        stage: options.stage,
        partId: options.partId,
        toolName: options.toolCall.name,
        source: options.displayFields.source,
        location: options.displayFields.location,
        serverId: options.displayFields.serverId,
        input: options.input,
    })
}

export async function writeToolValidationErrors(toolErrors: ToolValidationError[], options: ToolValidationErrorWriteOptions) {
    const toolMessages: ToolMessage[] = []

    for (const toolError of toolErrors) {
        const partId = createId()

        if (options.emitTranscript !== false) {
            if (toolError.outputPartType === 'resource') {
                await options.writeChunk({
                    type: 'resource-start',
                    partId,
                    resourceName: toolError.resourceName ?? toolError.toolName,
                    uri: toolError.uri ?? 'resource://unknown',
                    source: toolError.source,
                    location: toolError.location,
                    serverId: toolError.serverId ?? 'mcp-resource',
                })
                await writeStreamErrorChunk(options.writeChunk, {
                    scope: 'resource',
                    errorCode: 'TOOL_VALIDATION_FAILED',
                    retryable: false,
                    message: toolError.message,
                    stage: options.stage,
                    partId,
                    resourceName: toolError.resourceName ?? toolError.toolName,
                    uri: toolError.uri ?? 'resource://unknown',
                    source: toolError.source,
                    location: toolError.location,
                    serverId: toolError.serverId ?? 'mcp-resource',
                })
            } else {
                await options.writeChunk({
                    type: 'tool-start',
                    partId,
                    toolName: toolError.toolName,
                    title: toolError.title,
                    action: toolError.action,
                    source: toolError.source,
                    location: toolError.location,
                    serverId: toolError.serverId,
                    input: toolError.input,
                })
                await writeStreamErrorChunk(options.writeChunk, {
                    scope: 'tool',
                    errorCode: 'TOOL_VALIDATION_FAILED',
                    retryable: false,
                    message: toolError.message,
                    stage: options.stage,
                    partId,
                    toolName: toolError.toolName,
                    source: toolError.source,
                    location: toolError.location,
                    serverId: toolError.serverId,
                    input: toolError.input,
                })
            }
        }

        toolMessages.push(
            new ToolMessage({
                content: toolError.message,
                tool_call_id: toolError.id,
                status: 'error',
                metadata: {
                    toolName: toolError.toolName,
                },
            })
        )
    }

    return toolMessages
}

function getSafeFailureMessage(error: NormalizedToolExecutionError, policy: ToolExecutionPolicy) {
    if (policy.kind === 'standard-tool' && policy.profile === 'local-deterministic') {
        return error.message
    }

    switch (error.category) {
        case 'rate-limit':
            return '工具服务暂时繁忙。'
        case 'connection':
        case 'server':
            return '工具服务暂时不可用。'
        case 'timeout':
            return '工具执行超时。'
        case 'permission':
            return '工具访问未获授权。'
        case 'invalid-request':
            return '工具请求未被接受。'
        case 'unknown':
            return '工具执行失败。'
    }
}

function waitForToolRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal)

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, delayMs)
        const onAbort = () => {
            clearTimeout(timeout)
            reject(new DOMException('The operation was aborted.', 'AbortError'))
        }

        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

async function invokeStandardToolAttempt(
    toolDefinition: NonNullable<ReturnType<ToolDefinitionMap['get']>>,
    toolCall: ToolCall,
    parentSignal: AbortSignal | undefined,
    timeoutMs: number
) {
    const attemptController = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    let onParentAbort: (() => void) | undefined

    const terminationPromise = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
            const timeoutError = new ToolAttemptTimeoutError()
            attemptController.abort(timeoutError)
            reject(timeoutError)
        }, timeoutMs)

        if (parentSignal) {
            onParentAbort = () => {
                const abortError = new DOMException('The operation was aborted.', 'AbortError')
                attemptController.abort(parentSignal.reason ?? abortError)
                reject(parentSignal.reason ?? abortError)
            }
            parentSignal.addEventListener('abort', onParentAbort, { once: true })
        }
    })

    try {
        // attempt 超时只结束本次等待并 abort 底层调用；远端迟到结果不能再进入 transcript/state。
        return await Promise.race([
            toolDefinition.tool.invoke(
                {
                    args: toolCall.args,
                    id: toolCall.id,
                    name: toolCall.name,
                    type: 'tool_call',
                },
                { signal: attemptController.signal }
            ),
            terminationPromise,
        ])
    } finally {
        if (timeout) clearTimeout(timeout)
        if (parentSignal && onParentAbort) parentSignal.removeEventListener('abort', onParentAbort)
    }
}

function canWaitForRetry(delayMs: number, options: ExecuteToolCallOptions) {
    const nowMs = Date.now()
    const actionRemainingMs = options.actionDeadlineAtMs === undefined ? Number.POSITIVE_INFINITY : options.actionDeadlineAtMs - nowMs
    const hardRemainingMs = options.hardDeadlineAtMs === undefined ? Number.POSITIVE_INFINITY : options.hardDeadlineAtMs - nowMs

    return Math.min(actionRemainingMs, hardRemainingMs) > delayMs
}

export async function executeToolCall(
    rawToolCall: ToolCall,
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    options: ExecuteToolCallOptions
): Promise<ExecutedToolResult> {
    throwIfAborted(context.signal)

    const scopedToolDefinition = options.toolDefinitionMap.get(rawToolCall.name)
    if (scopedToolDefinition && options.runtimeScope && !toolSupportsRuntimeScope(scopedToolDefinition, options.runtimeScope)) {
        const toolCall = { ...rawToolCall, id: rawToolCall.id ?? createId() }
        const message = '工具 ' + toolCall.name + ' 未注册。'

        return {
            attemptCount: 0,
            failureCategory: 'permission',
            output: message,
            retryable: false,
            success: false,
            toolCall,
            toolMessage: new ToolMessage({
                content: message,
                metadata: { toolName: toolCall.name },
                status: 'error',
                tool_call_id: toolCall.id,
            }),
        }
    }

    const validationResult = options.validatedInput
        ? ({ success: true, toolCall: { ...rawToolCall, id: rawToolCall.id ?? createId() } } as const)
        : normalizeAndValidateToolCall(rawToolCall, options.toolDefinitionMap)
    const shouldEmitTranscript = shouldEmitPublicToolTranscript(options.runtimeScope)

    if (validationResult.success === false) {
        const toolMessage = (
            await writeToolValidationErrors([validationResult.toolError], {
                emitTranscript: shouldEmitTranscript,
                stage: options.errorStage,
                writeChunk,
            })
        )[0]!

        return {
            attemptCount: 0,
            failureCategory: 'invalid-request',
            output: validationResult.toolError.message,
            retryable: false,
            success: false,
            toolCall: { ...rawToolCall, id: validationResult.toolError.id },
            toolMessage,
        }
    }

    const toolCall = validationResult.toolCall
    const toolDefinition = options.toolDefinitionMap.get(toolCall.name)!
    const partId = createId()
    const input = formatToolInput(toolCall, options.toolDefinitionMap)
    const displayFields = getToolDisplayFields(toolCall, options.toolDefinitionMap)
    const resourceDisplayFields =
        displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall, options.toolDefinitionMap) : undefined
    const resourceServerId = displayFields.serverId ?? 'mcp-resource'

    if (shouldEmitTranscript) {
        if (displayFields.outputPartType === 'resource' && resourceDisplayFields) {
            await writeChunk({
                type: 'resource-start',
                partId,
                resourceName: resourceDisplayFields.resourceName,
                uri: resourceDisplayFields.uri,
                source: displayFields.source,
                location: displayFields.location,
                serverId: resourceServerId,
            })
        } else {
            await writeChunk({
                type: 'tool-start',
                partId,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                source: displayFields.source,
                location: displayFields.location,
                serverId: displayFields.serverId,
                input,
            })
        }
    }

    let attemptCount = 0
    let lastError: NormalizedToolExecutionError | undefined

    for (let retryOrdinal = 0; retryOrdinal <= 2; retryOrdinal += 1) {
        throwIfAborted(context.signal)

        try {
            let result: unknown

            if (toolDefinition.executionPolicy.kind === 'agent-tool') {
                attemptCount += 1
                result = await toolDefinition.tool.invoke(
                    {
                        args: toolCall.args,
                        id: toolCall.id,
                        name: toolCall.name,
                        type: 'tool_call',
                    },
                    { signal: context.signal }
                )
            } else {
                const timeoutMs = resolveToolAttemptTimeoutMs(toolDefinition.executionPolicy, {
                    actionDeadlineAtMs: options.actionDeadlineAtMs,
                    hardDeadlineAtMs: options.hardDeadlineAtMs,
                    nowMs: Date.now(),
                })!

                if (timeoutMs <= 0) {
                    throw new ToolAttemptTimeoutError()
                }

                attemptCount += 1
                result = await invokeStandardToolAttempt(toolDefinition, toolCall, context.signal, timeoutMs)
            }

            const resultPayload = extractToolResultPayload(result)
            const output = formatToolExecutionOutput(toolDefinition, resultPayload)
            const publicOutput = formatToolPublicOutput(toolDefinition, resultPayload, output)
            const toolMessage = new ToolMessage({
                content: output,
                tool_call_id: toolCall.id!,
                status: 'success',
                metadata: {
                    attemptCount,
                    toolName: toolCall.name,
                },
            })

            if (shouldEmitTranscript) {
                if (displayFields.outputPartType === 'resource') {
                    const resourceResultFields = getResourceResultFields(toolCall, resultPayload, publicOutput, options.toolDefinitionMap)

                    await writeChunk({
                        type: 'resource-end',
                        partId,
                        resourceName: resourceResultFields.resourceName,
                        uri: resourceResultFields.uri,
                        source: displayFields.source,
                        location: displayFields.location,
                        serverId: resourceServerId,
                        contentPreview: resourceResultFields.contentPreview,
                        isTruncated: resourceResultFields.isTruncated,
                        previewChars: resourceResultFields.previewChars,
                    })
                } else {
                    await writeChunk({
                        type: 'tool-end',
                        partId,
                        toolName: toolCall.name,
                        title: displayFields.title,
                        action: displayFields.action,
                        source: displayFields.source,
                        location: displayFields.location,
                        serverId: displayFields.serverId,
                        input,
                        output: publicOutput,
                    })
                }
            }

            return {
                attemptCount,
                output,
                rawResult: resultPayload,
                retryable: false,
                success: true,
                toolCall,
                toolMessage,
            }
        } catch (error) {
            if (isAbortError(error) || context.signal?.aborted) {
                throw error
            }

            lastError = normalizeToolExecutionError(error)
            const nextRetryOrdinal = (retryOrdinal + 1) as 1 | 2 | 3
            const policy = toolDefinition.executionPolicy
            // retrySafe 远端只读 Tool 对执行阶段的所有异常统一重试；错误分类只用于最终安全摘要与观测。
            const mayRetry =
                nextRetryOrdinal <= 2 &&
                policy.kind === 'standard-tool' &&
                policy.profile === 'remote-readonly' &&
                policy.retrySafe &&
                options.retryPermitPool

            if (!mayRetry) break

            const delayMs = resolveToolRetryDelayMs(lastError, nextRetryOrdinal as 1 | 2)
            if (!canWaitForRetry(delayMs, options)) break

            await waitForToolRetry(delayMs, context.signal)
            throwIfAborted(context.signal)

            const remainingAttemptMs = resolveToolAttemptTimeoutMs(policy, {
                actionDeadlineAtMs: options.actionDeadlineAtMs,
                hardDeadlineAtMs: options.hardDeadlineAtMs,
                nowMs: Date.now(),
            })
            if (
                !remainingAttemptMs ||
                !options.retryPermitPool.tryAcquire({ callId: toolCall.id!, retryOrdinal: nextRetryOrdinal as 1 | 2 })
            ) {
                break
            }
        }
    }

    const normalizedError = lastError ?? normalizeToolExecutionError(undefined)
    const message = getSafeFailureMessage(normalizedError, toolDefinition.executionPolicy)

    if (shouldEmitTranscript) {
        await writeToolExecutionError({
            displayFields,
            input,
            message,
            partId,
            resourceDisplayFields,
            retryable: normalizedError.retryable,
            stage: options.errorStage,
            toolCall,
            writeChunk,
        })
    }

    const toolMessage = new ToolMessage({
        content: message,
        tool_call_id: toolCall.id!,
        status: 'error',
        metadata: {
            attemptCount,
            failureCategory: normalizedError.category,
            toolName: toolCall.name,
        },
    })

    return {
        attemptCount,
        failureCategory: normalizedError.category,
        output: message,
        retryable: normalizedError.retryable,
        success: false,
        toolCall,
        toolMessage,
    }
}
