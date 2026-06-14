import { getModelProviderConfig } from './provider-config'

export class InputLengthExceededError extends Error {
    readonly code = 'MODEL_PROVIDER_INVALID_REQUEST' as const
    readonly maxChars: number
    readonly actualChars: number

    constructor(maxChars: number, actualChars: number) {
        super(`Request content exceeds input limit: ${actualChars} > ${maxChars}`)
        this.maxChars = maxChars
        this.actualChars = actualChars
        this.name = 'InputLengthExceededError'
    }
}

export interface ValidatableMessage {
    parts?: Array<{ text?: string; type?: string }>
    content?: unknown
}

/**
 * 校验输入长度是否超过服务端配置的上限。
 * 这里同时覆盖 request messages 和 runtime 注入后的 BaseMessage[]，都只做文本长度估算，不依赖 tokenizer。
 */
export function validateInputLength(messages: ValidatableMessage[]): void {
    const config = getModelProviderConfig()
    const maxChars = config.maxInputChars

    const totalChars = messages.reduce((sum, msg) => {
        return sum + countMessageChars(msg)
    }, 0)

    if (totalChars > maxChars) {
        throw new InputLengthExceededError(maxChars, totalChars)
    }
}

function countMessageChars(message: ValidatableMessage): number {
    if (Array.isArray(message.parts)) {
        return message.parts.reduce((sum, part) => sum + (part.text?.length ?? 0), 0)
    }

    return countContentChars(message.content)
}

function countContentChars(content: unknown): number {
    if (typeof content === 'string') {
        return content.length
    }

    if (Array.isArray(content)) {
        return content.reduce((sum, item) => sum + countContentChars(item), 0)
    }

    if (content && typeof content === 'object') {
        const record = content as { text?: unknown }
        if (typeof record.text === 'string') {
            return record.text.length
        }
    }

    return 0
}
