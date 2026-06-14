import type { CallbackHandlerMethods } from '@langchain/core/callbacks/base'
import type { LLMResult } from '@langchain/core/outputs'

import type { NormalizedModelUsage, ResolvedModelSelection } from '../types'

type ModelUsageContext = Pick<ResolvedModelSelection, 'modelId' | 'provider' | 'providerModel' | 'routeType'> & {
    estimated?: boolean
}

type UsageLogger = (message: string, metadata: Record<string, unknown>) => void

const inputTokenKeys = ['input_tokens', 'prompt_tokens', 'inputTokens', 'promptTokens'] as const
const outputTokenKeys = ['output_tokens', 'completion_tokens', 'outputTokens', 'completionTokens'] as const
const totalTokenKeys = ['total_tokens', 'totalTokens'] as const

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function readTokenCount(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
    for (const key of keys) {
        const value = record[key]

        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
            return value
        }
    }

    return undefined
}

/**
 * LangChain 会把不同 Provider 的 token 信息放在不同位置。这里只读取已知的 usage 容器，
 * 不递归遍历完整响应，避免误采集 prompt、模型正文或其他 Provider 原始字段。
 */
function findUsageRecord(source: unknown): Record<string, unknown> | undefined {
    const output = asRecord(source)

    if (!output) {
        return undefined
    }

    const generations = Array.isArray(output.generations) ? output.generations : []

    for (const generationGroup of generations) {
        if (!Array.isArray(generationGroup)) {
            continue
        }

        for (const generation of generationGroup) {
            const message = asRecord(asRecord(generation)?.message)
            const responseMetadata = asRecord(message?.response_metadata)
            const candidates = [
                message?.usage_metadata,
                message?.usageMetadata,
                responseMetadata?.tokenUsage,
                responseMetadata?.token_usage,
                responseMetadata?.usage,
            ]

            for (const candidate of candidates) {
                const usage = asRecord(candidate)

                if (usage) {
                    return usage
                }
            }
        }
    }

    const llmOutput = asRecord(output.llmOutput)
    const candidates = [
        output.usage_metadata,
        output.usageMetadata,
        output.tokenUsage,
        output.token_usage,
        output.usage,
        llmOutput?.tokenUsage,
        llmOutput?.token_usage,
        llmOutput?.usage,
        output,
    ]

    return candidates.map(asRecord).find(Boolean)
}

export function normalizeUsage(source: unknown, context: ModelUsageContext): NormalizedModelUsage {
    const usage = findUsageRecord(source)

    return {
        estimated: context.estimated || undefined,
        inputTokens: usage ? readTokenCount(usage, inputTokenKeys) : undefined,
        modelId: context.modelId,
        outputTokens: usage ? readTokenCount(usage, outputTokenKeys) : undefined,
        provider: context.provider,
        providerModel: context.providerModel,
        routeType: context.routeType,
        totalTokens: usage ? readTokenCount(usage, totalTokenKeys) : undefined,
    }
}

export function logModelUsage(usage: NormalizedModelUsage, logger?: UsageLogger): void {
    const metadataAvailable = usage.inputTokens !== undefined || usage.outputTokens !== undefined || usage.totalTokens !== undefined
    const metadata = {
        billingSource: false,
        estimated: usage.estimated === true,
        inputTokens: usage.inputTokens,
        metadataAvailable,
        modelId: usage.modelId,
        outputTokens: usage.outputTokens,
        provider: usage.provider,
        providerModel: usage.providerModel,
        routeType: usage.routeType,
        totalTokens: usage.totalTokens,
    }

    if (logger) {
        logger('[ai-mind:model-usage]', metadata)
        return
    }

    // 服务端统一日志出口；metadata 已收口为不含请求正文和原始 Provider 响应的安全字段。
    // eslint-disable-next-line no-console
    console.info('[ai-mind:model-usage]', metadata)
}

export function createModelUsageCallback(context: ModelUsageContext, logger?: UsageLogger): CallbackHandlerMethods {
    return {
        handleLLMEnd(output: LLMResult) {
            logModelUsage(normalizeUsage(output, context), logger)
        },
    }
}
