import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { z } from 'zod'

import type { NormalizedProviderError } from '@/lib/ai/model-provider'
import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import type { ChatToolDefinition } from '@/lib/ai/tools'

import type { RetryPermitPoolContract } from './retry-permit-pool'
import { ToolFingerprintAdmission, type ToolFingerprintAdmissionContract } from './tool-fingerprint-admission'

/**
 * loop 是唯一的常规 ReAct 模型链路。finalizer 只用于 loop 无法自然收口时，
 * 并且不再承担每次正常回答都必须经过的固定第二跳。
 */
export type GeneralReActModelPhase = 'finalizer' | 'loop'

export interface GeneralReActSelectedSkill {
    description?: string
    name: string
    skillId: string
}

export interface GeneralReActClock {
    now(): number
}

export interface GeneralReActPhaseModelOptions {
    maxRetries: 0
    phase: GeneralReActModelPhase
    signal: AbortSignal
    timeoutMs: number
}

export interface GeneralReActRunContext {
    readonly clock: GeneralReActClock
    readonly createPhaseModel: (options: GeneralReActPhaseModelOptions) => BaseChatModel
    readonly executionContext: ResolvedChatExecutionContext
    readonly hasPublishedPublicText?: () => boolean
    readonly isTransportClosed: () => boolean
    readonly normalizeModelError: (error: unknown) => NormalizedProviderError
    readonly publishChunk: (chunk: ChatStreamChunk) => Promise<void>
    readonly retryPermitPool: RetryPermitPoolContract
    readonly runSignal: AbortSignal
    readonly selectedSkill?: GeneralReActSelectedSkill
    readonly trustedUserUrls: string[]
    readonly toolFingerprintAdmission: ToolFingerprintAdmissionContract
    readonly toolDefinitionMap: ReadonlyMap<string, ChatToolDefinition>
}

export type GeneralReActRunContextInput = Omit<GeneralReActRunContext, 'toolFingerprintAdmission' | 'trustedUserUrls'> & {
    toolFingerprintAdmission?: ToolFingerprintAdmissionContract
    trustedUserUrls?: readonly string[]
}

function functionSchema<T extends (...args: never[]) => unknown>() {
    return z.custom<T>(value => typeof value === 'function')
}

export const generalReActRunContextSchema = z
    .object({
        clock: z
            .object({
                now: functionSchema<() => number>(),
            })
            .strict(),
        createPhaseModel: functionSchema<GeneralReActRunContext['createPhaseModel']>(),
        executionContext: z.custom<ResolvedChatExecutionContext>(value => typeof value === 'object' && value !== null),
        hasPublishedPublicText: functionSchema<NonNullable<GeneralReActRunContext['hasPublishedPublicText']>>().optional(),
        isTransportClosed: functionSchema<GeneralReActRunContext['isTransportClosed']>(),
        normalizeModelError: functionSchema<GeneralReActRunContext['normalizeModelError']>(),
        publishChunk: functionSchema<GeneralReActRunContext['publishChunk']>(),
        retryPermitPool: z.custom<RetryPermitPoolContract>(
            value =>
                typeof value === 'object' &&
                value !== null &&
                'snapshot' in value &&
                typeof value.snapshot === 'function' &&
                'tryAcquire' in value &&
                typeof value.tryAcquire === 'function',
            'Expected a RetryPermitPool'
        ),
        runSignal: z.custom<AbortSignal>(
            value => typeof AbortSignal !== 'undefined' && value instanceof AbortSignal,
            'Expected an AbortSignal'
        ),
        selectedSkill: z
            .object({
                description: z.string().optional(),
                name: z.string(),
                skillId: z.string(),
            })
            .strict()
            .optional(),
        trustedUserUrls: z.array(z.string().url()).max(8),
        toolFingerprintAdmission: z.custom<ToolFingerprintAdmissionContract>(
            value =>
                typeof value === 'object' &&
                value !== null &&
                'tryAcquire' in value &&
                typeof (value as { tryAcquire?: unknown }).tryAcquire === 'function',
            'Expected a ToolFingerprintAdmission'
        ),
        toolDefinitionMap: z.custom<ReadonlyMap<string, ChatToolDefinition>>(
            value => value instanceof Map,
            'Expected a readonly Tool Definition map'
        ),
    })
    .strict()

export function createGeneralReActRunContext(input: GeneralReActRunContextInput): GeneralReActRunContext {
    return Object.freeze(
        generalReActRunContextSchema.parse({
            ...input,
            hasPublishedPublicText: input.hasPublishedPublicText ?? (() => false),
            toolFingerprintAdmission: input.toolFingerprintAdmission ?? new ToolFingerprintAdmission(),
            trustedUserUrls: input.trustedUserUrls ?? [],
        })
    ) as GeneralReActRunContext
}
