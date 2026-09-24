import type { AIMessage } from '@langchain/core/messages'

export type ModelTurnFinishDisposition = 'blocked' | 'constrained' | 'natural'

export type ModelTurnFinish = {
    disposition: ModelTurnFinishDisposition
    source: 'additional_kwargs' | 'missing' | 'response_metadata'
    value?: string
}

const naturalFinishValues = new Set(['complete', 'completed', 'end_turn', 'stop', 'tool_calls'])
const constrainedFinishValues = new Set(['error', 'length', 'max_output_tokens', 'max_tokens', 'timeout'])
const blockedFinishValues = new Set(['content_filter', 'safety', 'unknown'])
const finishFieldNames = new Set(['completionreason', 'finishreason', 'stopreason'])

/**
 * 只归一化 provider 已显式声明的完成状态。缺失 metadata 是正常兼容路径，
 * 但未知的显式值必须 fail closed，不能把部分文本伪装为 natural final。
 */
export function normalizeModelTurnFinish(message: AIMessage): ModelTurnFinish {
    const metadataSources: Array<[ModelTurnFinish['source'], unknown]> = [
        ['response_metadata', message.response_metadata],
        ['additional_kwargs', message.additional_kwargs],
    ]

    for (const [source, metadata] of metadataSources) {
        const value = readFinishValue(metadata)
        if (!value) {
            continue
        }

        if (naturalFinishValues.has(value)) {
            return { disposition: 'natural', source, value }
        }
        if (constrainedFinishValues.has(value)) {
            return { disposition: 'constrained', source, value }
        }
        if (blockedFinishValues.has(value)) {
            return { disposition: 'blocked', source, value }
        }

        return { disposition: 'blocked', source, value }
    }

    return { disposition: 'natural', source: 'missing' }
}

function readFinishValue(metadata: unknown): string | undefined {
    if (!metadata || typeof metadata !== 'object') {
        return undefined
    }

    for (const [key, value] of Object.entries(metadata)) {
        const normalizedKey = key.replaceAll('_', '').toLowerCase()
        if (!finishFieldNames.has(normalizedKey) || typeof value !== 'string') {
            continue
        }

        const normalizedValue = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
        return normalizedValue || undefined
    }

    return undefined
}
