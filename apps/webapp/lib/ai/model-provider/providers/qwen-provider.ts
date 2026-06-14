import type { ModelProviderCapabilities } from '../types'
import type { ModelProvider } from './model-provider-interface'
import { OpenAICompatibleProvider } from './openai-compatible-provider'

const qwenCapabilities: ModelProviderCapabilities = {
    jsonOutput: true,
    reasoning: false,
    streaming: true,
    toolCalling: true,
    usageInStream: true,
}

/**
 * Qwen (阿里云百炼 DashScope) Provider。
 * 通过 OpenAI-compatible API 接入，API Key / baseURL 由 ModelProviderConfig 提供。
 */
export function createQwenProvider(): ModelProvider {
    return new OpenAICompatibleProvider('qwen', qwenCapabilities)
}
