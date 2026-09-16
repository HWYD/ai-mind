export type WebProviderEnv = Record<string, string | undefined> &
    Partial<
        Record<
            | 'AI_MIND_AGENT_RUN_SESSION_SECRET'
            | 'AI_MIND_DEEPSEEK_API_KEY'
            | 'AI_MIND_DOUBAO_API_KEY'
            | 'AI_MIND_QWEN_API_KEY'
            | 'AI_MIND_WEB_PROVIDER'
            | 'AI_MIND_ZHIPU_API_KEY'
            | 'AI_MIND_ZHIPU_SEARCH_ENGINE'
            | 'LANGSMITH_API_KEY'
            | 'TAVILY_API_KEY',
            string
        >
    >

export type TavilyWebProviderConfig = {
    apiKey: string
    extractEndpoint: 'https://api.tavily.com/extract'
    knownSecrets: string[]
    searchEndpoint: 'https://api.tavily.com/search'
}

export type ZhipuWebProviderConfig = {
    apiKey: string
    engine: 'search_std'
    knownSecrets: string[]
    readerEndpoint: 'https://open.bigmodel.cn/api/paas/v4/reader'
    searchEndpoint: 'https://open.bigmodel.cn/api/paas/v4/web_search'
}

export function resolveOutboundKnownSecrets(env: WebProviderEnv = process.env): string[] {
    return [
        env.AI_MIND_AGENT_RUN_SESSION_SECRET,
        env.AI_MIND_DEEPSEEK_API_KEY,
        env.AI_MIND_DOUBAO_API_KEY,
        env.AI_MIND_QWEN_API_KEY,
        env.LANGSMITH_API_KEY,
        env.TAVILY_API_KEY,
        env.AI_MIND_ZHIPU_API_KEY,
    ]
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value))
}

export function resolveZhipuWebProviderConfig(env: WebProviderEnv = process.env): ZhipuWebProviderConfig | null {
    const apiKey = env.AI_MIND_ZHIPU_API_KEY?.trim()
    const engine = env.AI_MIND_ZHIPU_SEARCH_ENGINE?.trim() || 'search_std'
    if (!apiKey || engine !== 'search_std') {
        return null
    }

    return {
        apiKey,
        engine: 'search_std',
        knownSecrets: resolveOutboundKnownSecrets(env),
        readerEndpoint: 'https://open.bigmodel.cn/api/paas/v4/reader',
        searchEndpoint: 'https://open.bigmodel.cn/api/paas/v4/web_search',
    }
}

export function resolveTavilyWebProviderConfig(env: WebProviderEnv = process.env): TavilyWebProviderConfig | null {
    const apiKey = env.TAVILY_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    return {
        apiKey,
        extractEndpoint: 'https://api.tavily.com/extract',
        knownSecrets: resolveOutboundKnownSecrets(env),
        searchEndpoint: 'https://api.tavily.com/search',
    }
}
