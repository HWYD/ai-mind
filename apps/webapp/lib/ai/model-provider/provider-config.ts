import { modelCatalog } from './catalog/model-catalog'
import { type AiMindLlmProvider, aiMindLlmProviders, type ModelProviderConfig } from './types'

type ModelProviderEnv = Record<string, string | undefined>

export type ModelProviderConfigErrorCode = 'default_model_not_allowed' | 'default_model_not_in_catalog' | 'invalid_allowed_providers'

export class ModelProviderConfigError extends Error {
    readonly code: ModelProviderConfigErrorCode

    // 保留机器可判断的错误码，方便启动阶段区分“目录缺失”“Provider 不允许”等配置问题。
    constructor(code: ModelProviderConfigErrorCode, message: string) {
        super(message)
        this.code = code
        this.name = 'ModelProviderConfigError'
    }
}

// 这组默认值只负责“环境变量缺省时怎么兜底”，不决定模型目录里哪些模型可见。
const defaultModelProviderConfig = {
    chatMaxOutputTokens: 4096,
    deepseekBaseURL: 'https://api.deepseek.com',
    defaultModelId: 'ollama/qwen3-8b',
    maxInputChars: 12000,
    ollamaBaseURL: 'http://127.0.0.1:11434',
    qwenBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    tasklistMaxOutputTokens: 8192,
    temperature: 0.7,
    timeoutMs: 60000,
} as const

// 从环境变量和默认值组装最终 Provider 配置，并在启动阶段提前校验默认模型是否合法。
export function getModelProviderConfig(env: ModelProviderEnv = process.env): ModelProviderConfig {
    const allowedProviders = parseAllowedProviders(env.AI_MIND_ALLOWED_PROVIDERS)
    const defaultModelId = env.AI_MIND_DEFAULT_MODEL_ID?.trim() || defaultModelProviderConfig.defaultModelId
    const defaultModelItem = modelCatalog.find(item => item.id === defaultModelId) ?? null

    // 默认模型既要存在于项目模型目录里，也必须来自当前允许启用的 Provider。
    if (!defaultModelItem) {
        throw new ModelProviderConfigError(
            'default_model_not_in_catalog',
            `Default model "${defaultModelId}" is not defined in AI Mind model catalog.`
        )
    }

    if (!allowedProviders.includes(defaultModelItem.provider)) {
        throw new ModelProviderConfigError(
            'default_model_not_allowed',
            `Default model provider "${defaultModelItem.provider}" is not allowed in current model provider config.`
        )
    }

    return {
        allowedProviders,
        chatMaxOutputTokens: readPositiveInteger(env.AI_MIND_CHAT_MAX_OUTPUT_TOKENS, defaultModelProviderConfig.chatMaxOutputTokens),
        deepseek: {
            apiKey: env.AI_MIND_DEEPSEEK_API_KEY?.trim() || undefined,
            baseURL: env.AI_MIND_DEEPSEEK_BASE_URL?.trim() || defaultModelProviderConfig.deepseekBaseURL,
        },
        defaultModelId,
        maxInputChars: readPositiveInteger(env.AI_MIND_MAX_INPUT_CHARS, defaultModelProviderConfig.maxInputChars),
        ollama: {
            baseURL: env.AI_MIND_OLLAMA_BASE_URL?.trim() || env.OLLAMA_BASE_URL?.trim() || defaultModelProviderConfig.ollamaBaseURL,
        },
        qwen: {
            apiKey: env.AI_MIND_QWEN_API_KEY?.trim() || undefined,
            baseURL: env.AI_MIND_QWEN_BASE_URL?.trim() || defaultModelProviderConfig.qwenBaseURL,
        },
        tasklistMaxOutputTokens: readPositiveInteger(
            env.AI_MIND_TASKLIST_MAX_OUTPUT_TOKENS,
            defaultModelProviderConfig.tasklistMaxOutputTokens
        ),
        temperature: readTemperature(env.AI_MIND_LLM_TEMPERATURE, defaultModelProviderConfig.temperature),
        timeoutMs: readPositiveInteger(env.AI_MIND_LLM_TIMEOUT_MS, defaultModelProviderConfig.timeoutMs),
    }
}

// 解析 AI_MIND_ALLOWED_PROVIDERS，返回当前允许启用的 Provider 列表。
function parseAllowedProviders(rawValue: string | undefined): AiMindLlmProvider[] {
    const value = rawValue?.trim()

    // 未显式配置时默认放开全部已注册 Provider，避免本地开发必须额外写环境变量。
    if (!value) {
        return [...aiMindLlmProviders]
    }

    const providers = value
        .split(',')
        .map(provider => provider.trim())
        .filter(Boolean)

    if (providers.length === 0 || providers.some(provider => !isAiMindLlmProvider(provider))) {
        throw new ModelProviderConfigError('invalid_allowed_providers', 'AI_MIND_ALLOWED_PROVIDERS contains unsupported provider values.')
    }

    return [...new Set(providers)] as AiMindLlmProvider[]
}

// 判断一个字符串是否属于项目支持的 Provider 枚举，用于环境变量校验。
function isAiMindLlmProvider(value: string): value is AiMindLlmProvider {
    return aiMindLlmProviders.includes(value as AiMindLlmProvider)
}

// 读取必须为正整数的配置项；缺失或非法时统一回退到默认值。
function readPositiveInteger(rawValue: string | undefined, fallback: number): number {
    const value = rawValue?.trim()
    if (!value) return fallback
    const parsed = Number(value)
    // 环境变量不合法时静默回退到默认值，避免配置写错直接阻断整个聊天服务启动。
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// 读取模型温度配置，并把结果限制在当前约定的 [0, 2] 范围内。
function readTemperature(rawValue: string | undefined, fallback: number): number {
    const value = rawValue?.trim()
    if (!value) return fallback
    const parsed = Number(value)

    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : fallback
}
