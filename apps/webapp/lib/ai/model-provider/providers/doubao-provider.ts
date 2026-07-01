import type { ModelProviderCapabilities } from '../types'
import type { ModelProvider } from './model-provider-interface'
import { OpenAICompatibleProvider } from './openai-compatible-provider'

const doubaoCapabilities: ModelProviderCapabilities = {
    jsonOutput: true,
    reasoning: false,
    streaming: true,
    toolCalling: true,
    usageInStream: true,
}

export function createDoubaoProvider(): ModelProvider {
    return new OpenAICompatibleProvider('doubao', doubaoCapabilities)
}
