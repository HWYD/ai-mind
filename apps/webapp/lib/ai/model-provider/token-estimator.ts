import { getEncoding } from 'js-tiktoken'

const MESSAGE_FRAMING_TOKENS = 8
const REQUEST_FRAMING_TOKENS = 3
const PROVIDER_SAFETY_MARGIN = 0.1
const encoder = getEncoding('o200k_base')

export interface TokenEstimate {
    estimatedTokens: number
    framingTokens: number
    messageTokens: number
    safetyMarginTokens: number
    structuredPayloadTokens: number
}

export interface TokenEstimationOptions {
    nonMessagePayloads?: unknown[]
}

export function estimateModelInputTokens(messages: unknown[], options: TokenEstimationOptions = {}): TokenEstimate {
    let messageTokens = 0
    let structuredPayloadTokens = 0

    for (const message of messages) {
        const record = toRecord(message)
        const role = readRole(record)
        const name = typeof record.name === 'string' ? record.name : ''
        const content = record.content

        messageTokens += countTokens(role)
        messageTokens += countTokens(name)

        if (typeof content === 'string') {
            messageTokens += countTokens(content)
        } else if (content !== undefined) {
            structuredPayloadTokens += countTokens(stableSerialize(content))
        }

        const payload = pickStructuredPayload(record)

        if (Object.keys(payload).length > 0) {
            structuredPayloadTokens += countTokens(stableSerialize(payload))
        }
    }

    for (const payload of options.nonMessagePayloads ?? []) {
        structuredPayloadTokens += countTokens(stableSerialize(payload))
    }

    const framingTokens = messages.length * MESSAGE_FRAMING_TOKENS + REQUEST_FRAMING_TOKENS
    const subtotal = messageTokens + structuredPayloadTokens + framingTokens
    const safetyMarginTokens = Math.ceil(subtotal * PROVIDER_SAFETY_MARGIN)

    return {
        estimatedTokens: subtotal + safetyMarginTokens,
        framingTokens,
        messageTokens,
        safetyMarginTokens,
        structuredPayloadTokens,
    }
}

function countTokens(value: string): number {
    return value ? encoder.encode(value).length : 0
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function readRole(record: Record<string, unknown>): string {
    if (typeof record.role === 'string') {
        return record.role
    }

    const getType = record._getType

    return typeof getType === 'function' ? String(getType.call(record)) : 'unknown'
}

function pickStructuredPayload(record: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {}

    for (const key of ['additional_kwargs', 'tool_call_id', 'tool_calls']) {
        if (record[key] !== undefined) {
            payload[key] = record[key]
        }
    }

    return payload
}

function stableSerialize(value: unknown): string {
    if (value === null) return 'null'

    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        const entries = Object.entries(record)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`)

        return `{${entries.join(',')}}`
    }

    return JSON.stringify(String(value))
}
