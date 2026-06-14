import type { ModelProviderCapabilities } from '../types'
import type { ModelProvider } from './model-provider-interface'
import { OpenAICompatibleProvider } from './openai-compatible-provider'

const deepseekCapabilities: ModelProviderCapabilities = {
    jsonOutput: true,
    reasoning: false,
    streaming: true,
    toolCalling: true,
    usageInStream: true,
}

/**
 * DeepSeek Provider。
 * 通过 OpenAI-compatible API 接入，API Key / baseURL 由 ModelProviderConfig 提供。
 */
export function createDeepSeekProvider(): ModelProvider {
    return new OpenAICompatibleProvider('deepseek', deepseekCapabilities)
}
