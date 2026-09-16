import { BaseMessage, HumanMessage } from '@langchain/core/messages'
import { ReducedValue, StateSchema } from '@langchain/langgraph'
import { z } from 'zod'

import { canonicalizePublicWebUrl } from '@/lib/ai/tools/web/web-access-policy'
import { resolveOutboundKnownSecrets } from '@/lib/ai/tools/web/web-provider-config'

import { actionBatchAdmissionSchema, mergeKeyedUnion, mergeStringUnion, sumNonNegativeDelta } from './action-batch-admission'
import { GENERAL_REACT_RUNTIME_DEFAULTS } from './runtime-config'

const nonNegativeInteger = z.number().int().nonnegative()
const authorizedUrlSchema = z
    .object({
        canonicalUrl: z.string().url(),
        grantCallId: z.string().min(1).nullable(),
        grantedAtRound: nonNegativeInteger,
        grantedBy: z.enum(['user', 'web-search']),
        host: z.string().min(1),
    })
    .strict()

const sourceRecordSchema = z
    .object({
        originTool: z.enum(['web-search', 'read-url']),
        snippet: z.string().nullable(),
        sourceId: z.string().min(1),
        status: z.enum(['discovered', 'read', 'unavailable']),
        title: z.string(),
        url: z.string().url(),
    })
    .strict()

function createCounter(maximum: number = Number.MAX_SAFE_INTEGER) {
    const schema = nonNegativeInteger.max(maximum)

    return new ReducedValue(schema.default(0), {
        inputSchema: schema,
        reducer: (current, delta) => Math.min(maximum, sumNonNegativeDelta(current, delta)),
    })
}

type AuthorizedUrl = z.infer<typeof authorizedUrlSchema>
type SourceRecord = z.infer<typeof sourceRecordSchema>

function resolveAuthorizedUrl(left: AuthorizedUrl, right: AuthorizedUrl): AuthorizedUrl {
    if (left.grantedBy !== right.grantedBy) {
        return left.grantedBy === 'user' ? left : right
    }

    if (left.grantedAtRound !== right.grantedAtRound) {
        return left.grantedAtRound < right.grantedAtRound ? left : right
    }

    return (left.grantCallId ?? '') <= (right.grantCallId ?? '') ? left : right
}

const sourceStatusRank = {
    discovered: 0,
    unavailable: 1,
    read: 2,
} as const

function resolveSourceRecord(left: SourceRecord, right: SourceRecord): SourceRecord {
    if (sourceStatusRank[left.status] !== sourceStatusRank[right.status]) {
        return sourceStatusRank[left.status] > sourceStatusRank[right.status] ? left : right
    }

    return JSON.stringify(left) <= JSON.stringify(right) ? left : right
}

export const generalReActAgentStateSchema = new StateSchema({
    _actionDeadlineAtMs: nonNegativeInteger.default(0),
    _actionModelCallCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxActionModelCalls),
    _actionRoundCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxToolBearingActionRounds),
    _authorizedUrls: new ReducedValue(
        z.array(authorizedUrlSchema).default(() => []),
        {
            inputSchema: z.array(authorizedUrlSchema),
            reducer: (current, delta) => mergeKeyedUnion(current, delta, value => value.canonicalUrl, resolveAuthorizedUrl),
        }
    ),
    _callFingerprints: new ReducedValue(
        z.array(z.string().min(1)).default(() => []),
        {
            inputSchema: z.array(z.string().min(1)),
            reducer: mergeStringUnion,
        }
    ),
    _currentActionBatch: actionBatchAdmissionSchema.nullable().default(null),
    _executedToolCallCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls),
    _finalizationMode: z.enum(['normal', 'constrained', 'deterministic_fallback']).nullable().default(null),
    _hardDeadlineAtMs: nonNegativeInteger.default(0),
    _modelRetryCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxModelRetries),
    _noProgressRounds: nonNegativeInteger.max(GENERAL_REACT_RUNTIME_DEFAULTS.maxNoProgressRounds).default(0),
    _observationChars: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxObservationChars),
    _runPhase: z.enum(['preparing', 'acting', 'answering', 'completed', 'failed', 'cancelled']).default('preparing'),
    _sources: new ReducedValue(
        z.array(sourceRecordSchema).default(() => []),
        {
            inputSchema: z.array(sourceRecordSchema),
            reducer: (current, delta) => mergeKeyedUnion(current, delta, value => value.url, resolveSourceRecord),
        }
    ),
    _startedAtMs: nonNegativeInteger.default(0),
    _stopReason: z
        .enum([
            'natural_completion',
            'action_round_limit',
            'tool_call_limit',
            'model_call_limit',
            'action_deadline',
            'run_deadline',
            'observation_limit',
            'no_progress',
            'model_error',
            'tool_failure',
            'security_denied',
            'request_cancelled',
            'agent_contract_violation',
        ])
        .nullable()
        .default(null),
    _toolCallCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxLogicalToolCalls),
    _toolRequestCount: createCounter(),
    _toolRetryCount: createCounter(GENERAL_REACT_RUNTIME_DEFAULTS.maxToolRetries),
})

export type GeneralReActAgentState = typeof generalReActAgentStateSchema.State
export type GeneralReActAgentStateUpdate = typeof generalReActAgentStateSchema.Update

export function createGeneralReActInitialState(startedAtMs: number, messages: readonly BaseMessage[] = []): GeneralReActAgentState {
    if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) {
        throw new TypeError('General ReAct startedAtMs must be a non-negative safe integer')
    }

    return {
        _actionDeadlineAtMs: startedAtMs + GENERAL_REACT_RUNTIME_DEFAULTS.actionDeadlineMs,
        _actionModelCallCount: 0,
        _actionRoundCount: 0,
        _authorizedUrls: collectUserAuthorizedUrls(messages),
        _callFingerprints: [],
        _currentActionBatch: null,
        _executedToolCallCount: 0,
        _finalizationMode: null,
        _hardDeadlineAtMs: startedAtMs + GENERAL_REACT_RUNTIME_DEFAULTS.hardDeadlineMs,
        _modelRetryCount: 0,
        _noProgressRounds: 0,
        _observationChars: 0,
        _runPhase: 'preparing',
        _sources: [],
        _startedAtMs: startedAtMs,
        _stopReason: null,
        _toolCallCount: 0,
        _toolRequestCount: 0,
        _toolRetryCount: 0,
    }
}

function collectUserAuthorizedUrls(messages: readonly BaseMessage[]): Array<z.infer<typeof authorizedUrlSchema>> {
    const latestUserMessage = [...messages].reverse().find(message => HumanMessage.isInstance(message))
    if (!latestUserMessage) {
        return []
    }

    const grants = new Map<string, z.infer<typeof authorizedUrlSchema>>()
    for (const match of latestUserMessage.text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
        const rawUrl = match[0].replace(/[\],.;:!?，。！？；：、》」』）】]+$/u, '')
        if (!rawUrl) {
            continue
        }

        try {
            const canonicalUrl = canonicalizePublicWebUrl(rawUrl, { knownSecrets: resolveOutboundKnownSecrets() })
            grants.set(canonicalUrl, {
                canonicalUrl,
                grantCallId: null,
                grantedAtRound: 0,
                grantedBy: 'user',
                host: new URL(canonicalUrl).hostname,
            })
        } catch {
            // Invalid, private, or credential-bearing URLs are intentionally ignored.
        }
    }

    return [...grants.values()]
}
