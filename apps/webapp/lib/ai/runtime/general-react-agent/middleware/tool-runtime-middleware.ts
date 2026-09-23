import type { PublicSourceRecord } from '@ai-mind/stream-core/protocol'
import type { ToolCall } from '@langchain/core/messages'
import { ToolMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { createMiddleware } from 'langchain'

import { createId } from '@/lib/ai/create-id'
import { type GeneralReActRunContext, generalReActRunContextSchema } from '@/lib/ai/runtime/general-react-agent/agent-context'
import {
    type GeneralReActAgentState,
    generalReActAgentStateSchema,
    type GeneralReActAgentStateUpdate,
} from '@/lib/ai/runtime/general-react-agent/agent-state'
import { createGeneralReActToolFingerprint } from '@/lib/ai/runtime/general-react-agent/middleware/run-policy-middleware'
import { GENERAL_REACT_RUNTIME_DEFAULTS } from '@/lib/ai/runtime/general-react-agent/runtime-config'
import { executeToolCall, normalizeAndValidateToolCall } from '@/lib/ai/runtime/tool-runtime'
import { toolSupportsRuntimeScope } from '@/lib/ai/tools'
import { assertOutboundDataAllowed, OutboundSecretDeniedError } from '@/lib/ai/tools/web/outbound-secret-guard'
import { assertNoForbiddenWebUrlInText, canonicalizePublicWebUrl, WebAccessPolicyError } from '@/lib/ai/tools/web/web-access-policy'
import { resolveOutboundKnownSecrets } from '@/lib/ai/tools/web/web-provider-config'

export type GeneralReActObservationStatus =
    | 'budget_blocked'
    | 'cancelled'
    | 'denied'
    | 'duplicate'
    | 'execution_error'
    | 'provider_error'
    | 'success'
    | 'timeout'
    | 'validation_error'

export type GeneralReActToolCommandUpdate = GeneralReActAgentStateUpdate & {
    messages?: ToolMessage[]
}

export async function executeGeneralReActToolCall(input: {
    context: GeneralReActRunContext
    state: GeneralReActAgentState
    toolCall: ToolCall
}): Promise<Command<unknown, GeneralReActToolCommandUpdate>> {
    const callId = input.toolCall.id
    const definition = input.context.toolDefinitionMap.get(input.toolCall.name)
    const admission = callId ? input.state._currentActionBatch?.admissions[callId] : undefined
    if (!callId || !admission?.admitted) {
        return await rejectedObservationCommand({
            callId: callId ?? 'missing-tool-call-id',
            content: '本次工具调用已达到运行预算上限。',
            definition,
            context: input.context,
            status: 'budget_blocked',
            toolName: input.toolCall.name,
        })
    }

    if (
        !definition ||
        !toolSupportsRuntimeScope(definition, 'general-react-agent') ||
        definition.executionPolicy.kind !== 'standard-tool'
    ) {
        return await rejectedObservationCommand({
            callId,
            content: '该工具不在当前运行允许的范围内。',
            definition,
            context: input.context,
            ordinal: admission.ordinal,
            status: 'denied',
            toolName: input.toolCall.name,
        })
    }

    const validation = normalizeAndValidateToolCall(input.toolCall, input.context.toolDefinitionMap as Map<string, typeof definition>)
    if (!validation.success) {
        return await rejectedObservationCommand({
            callId,
            content: '工具参数无效。',
            definition,
            context: input.context,
            ordinal: admission.ordinal,
            status: 'validation_error',
            toolName: input.toolCall.name,
        })
    }

    let validatedToolCall = validation.toolCall
    try {
        validatedToolCall = enforceWebPoliciesBeforeFingerprint(validatedToolCall)
    } catch (error) {
        if (error instanceof OutboundSecretDeniedError || error instanceof WebAccessPolicyError) {
            return await rejectedObservationCommand({
                callId,
                content: '请求包含禁止外发的凭据。',
                definition,
                context: input.context,
                ordinal: admission.ordinal,
                status: 'denied',
                toolName: input.toolCall.name,
            })
        }
        throw error
    }

    const fingerprint = createGeneralReActToolFingerprint(validatedToolCall.name, validatedToolCall.args)
    if (input.state._callFingerprints.includes(fingerprint) || !input.context.toolFingerprintAdmission.tryAcquire(fingerprint)) {
        return await rejectedObservationCommand({
            callId,
            content: '该工具调用与本轮已执行调用重复。',
            definition,
            context: input.context,
            ordinal: admission.ordinal,
            status: 'duplicate',
            toolName: input.toolCall.name,
        })
    }

    if (validatedToolCall.name === 'read-url') {
        const url = getStringArgument(validatedToolCall.args, 'url')
        if (!url || !input.state._authorizedUrls.some(grant => grant.canonicalUrl === url)) {
            return await rejectedObservationCommand({
                callId,
                content: '该链接未在当前请求中获得读取授权。',
                definition,
                context: input.context,
                fingerprint,
                ordinal: admission.ordinal,
                status: 'denied',
                toolName: input.toolCall.name,
            })
        }
    }

    let terminalChunk: Parameters<GeneralReActRunContext['publishChunk']>[0] | undefined
    const result = await executeToolCall(
        validatedToolCall,
        { ...input.context.executionContext, signal: input.context.runSignal },
        async chunk => {
            if (chunk.type === 'error' || chunk.type === 'resource-end' || chunk.type === 'tool-end') {
                terminalChunk = chunk
                return
            }

            await input.context.publishChunk(chunk)
        },
        {
            actionDeadlineAtMs: input.state._loopDeadlineAtMs,
            hardDeadlineAtMs: input.state._hardDeadlineAtMs,
            retryPermitPool: input.context.retryPermitPool,
            runtimeScope: 'general-react-agent',
            toolDefinitionMap: input.context.toolDefinitionMap as Map<string, typeof definition>,
            validatedInput: true,
        }
    )

    const status = toObservationStatus(result.success, result.failureCategory)
    const modelContent = result.output.slice(0, admission.observationCharAllowance)
    const truncated = modelContent.length < result.output.length
    const sources = result.success ? createSourceRecords(validatedToolCall.name, result.rawResult) : []
    const authorizedUrls =
        result.success && validatedToolCall.name === 'web-search'
            ? sources.map(source => ({
                  canonicalUrl: source.url,
                  grantCallId: callId,
                  grantedAtRound: input.state._toolBearingRoundCount,
                  grantedBy: 'web-search' as const,
                  host: new URL(source.url).hostname,
              }))
            : []

    if (terminalChunk) {
        const publicChunk = terminalChunk.type === 'tool-end' && sources.length > 0 ? { ...terminalChunk, sources } : terminalChunk
        await input.context.publishChunk(publicChunk)
    }

    const retryCount = Math.max(0, (result.attemptCount ?? 1) - 1)
    const toolMessage = new ToolMessage({
        content: modelContent,
        metadata: {
            ...result.toolMessage.metadata,
            executed: (result.attemptCount ?? 0) > 0,
            observationStatus: status,
            ordinal: admission.ordinal,
            retryCount,
            toolName: validatedToolCall.name,
            truncated,
        },
        status: result.success ? 'success' : 'error',
        tool_call_id: callId,
    })

    return new Command({
        update: {
            _authorizedUrls: authorizedUrls,
            _callFingerprints: [fingerprint],
            _executedToolCallCount: boundedCounterDelta(
                input.state._executedToolCallCount,
                GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls,
                result.attemptCount && result.attemptCount > 0 ? 1 : 0
            ),
            _observationChars: boundedCounterDelta(
                input.state._observationChars,
                GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars,
                modelContent.length
            ),
            _sources: sources.map(source => ({ ...source, snippet: source.snippet ?? null })),
            _toolRetryCount: boundedCounterDelta(input.state._toolRetryCount, GENERAL_REACT_RUNTIME_DEFAULTS.maxToolRetries, retryCount),
            messages: [toolMessage],
        },
    })
}

function boundedCounterDelta(current: number, maximum: number, delta: number) {
    return Math.max(0, Math.min(delta, maximum - current))
}

export function createGeneralReActToolRuntimeMiddleware() {
    return createMiddleware({
        name: 'GeneralReActToolRuntimeMiddleware',
        contextSchema: generalReActRunContextSchema,
        stateSchema: generalReActAgentStateSchema,
        wrapToolCall: request =>
            executeGeneralReActToolCall({
                context: request.runtime.context,
                state: request.state,
                toolCall: request.toolCall,
            }),
    })
}

function enforceWebPoliciesBeforeFingerprint(toolCall: ToolCall): ToolCall {
    const knownSecrets = resolveOutboundKnownSecrets()
    if (toolCall.name === 'web-search') {
        const query = getStringArgument(toolCall.args, 'query')
        if (query) {
            assertOutboundDataAllowed(query, { knownSecrets })
            assertNoForbiddenWebUrlInText(query, { knownSecrets })
        }
        return toolCall
    }

    if (toolCall.name === 'read-url') {
        const url = getStringArgument(toolCall.args, 'url')
        if (!url) {
            return toolCall
        }
        return {
            ...toolCall,
            args: { ...(toolCall.args as Record<string, unknown>), url: canonicalizePublicWebUrl(url, { knownSecrets }) },
        }
    }

    return toolCall
}

function observationCommand(input: {
    callId: string
    content: string
    fingerprint?: string
    ordinal?: number
    status: Exclude<GeneralReActObservationStatus, 'success'>
    toolName: string
}): Command<unknown, GeneralReActToolCommandUpdate> {
    return new Command({
        update: {
            ...(input.fingerprint ? { _callFingerprints: [input.fingerprint] } : {}),
            messages: [
                new ToolMessage({
                    content: input.content,
                    metadata: {
                        executed: false,
                        observationStatus: input.status,
                        ...(input.ordinal ? { ordinal: input.ordinal } : {}),
                        retryCount: 0,
                        toolName: input.toolName,
                    },
                    status: 'error',
                    tool_call_id: input.callId,
                }),
            ],
        },
    })
}

async function rejectedObservationCommand(
    input: Parameters<typeof observationCommand>[0] & {
        context: GeneralReActRunContext
        definition?: ReturnType<GeneralReActRunContext['toolDefinitionMap']['get']>
    }
): Promise<Command<unknown, GeneralReActToolCommandUpdate>> {
    const isPublicTool =
        Boolean(input.definition) &&
        toolSupportsRuntimeScope(input.definition!, 'general-react-agent') &&
        input.definition!.executionPolicy.kind === 'standard-tool'
    const partId = createId()

    await input.context.publishChunk({
        type: 'tool-start',
        partId,
        toolName: isPublicTool ? input.toolName : 'tool-request',
        ...(isPublicTool ? {} : { title: '工具请求' }),
        input: '',
    })
    await input.context.publishChunk({
        type: 'error',
        scope: 'tool',
        errorCode: 'TOOL_EXECUTION_FAILED',
        retryable: false,
        message: '工具请求未执行。',
        stage: 'tool-execution',
        partId,
        toolName: isPublicTool ? input.toolName : 'tool-request',
    })

    return observationCommand(input)
}

function toObservationStatus(
    success: boolean,
    failureCategory: 'connection' | 'invalid-request' | 'permission' | 'rate-limit' | 'server' | 'timeout' | 'unknown' | undefined
): GeneralReActObservationStatus {
    if (success) return 'success'
    if (failureCategory === 'timeout') return 'timeout'
    if (failureCategory === 'permission' || failureCategory === 'invalid-request') return 'denied'
    if (failureCategory === 'connection' || failureCategory === 'rate-limit' || failureCategory === 'server') return 'provider_error'
    return 'execution_error'
}

function createSourceRecords(toolName: string, rawResult: unknown): PublicSourceRecord[] {
    if (!rawResult || typeof rawResult !== 'object') {
        return []
    }

    const toPublicSource = (input: {
        originTool: PublicSourceRecord['originTool']
        snippet?: unknown
        title?: unknown
        url?: unknown
    }): PublicSourceRecord | null => {
        if (typeof input.url !== 'string') {
            return null
        }

        let url: string
        try {
            url = canonicalizePublicWebUrl(input.url, { knownSecrets: resolveOutboundKnownSecrets() })
        } catch {
            return null
        }

        const parsedUrl = new URL(url)
        const title = typeof input.title === 'string' ? input.title.trim().slice(0, 300) : ''
        const snippet = typeof input.snippet === 'string' ? input.snippet.trim().slice(0, 500) : ''

        return {
            originTool: input.originTool,
            ...(snippet ? { snippet } : {}),
            sourceId: `source-${hashPublicSourceUrl(url)}`,
            status: input.originTool === 'read-url' ? 'read' : 'discovered',
            title: title || parsedUrl.hostname,
            url,
        }
    }

    const result = rawResult as Record<string, unknown>
    if (toolName === 'web-search' && Array.isArray(result.results)) {
        return result.results.slice(0, 5).flatMap(item => {
            if (!item || typeof item !== 'object') return []
            const record = item as Record<string, unknown>
            const source = toPublicSource({
                originTool: 'web-search',
                snippet: record.snippet ?? record.content,
                title: record.title,
                url: record.url,
            })

            return source ? [source] : []
        })
    }
    if (toolName === 'read-url' && typeof result.requestedUrl === 'string') {
        const source = toPublicSource({
            originTool: 'read-url',
            title: result.title,
            url: result.requestedUrl,
        })

        return source ? [source] : []
    }
    return []
}

function hashPublicSourceUrl(value: string): string {
    let hash = 0x811c9dc5

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }

    return (hash >>> 0).toString(36)
}

function getStringArgument(args: unknown, name: string): string | undefined {
    if (!args || typeof args !== 'object') return undefined
    const value = (args as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
}
