export type WebProviderEnv = Record<string, string | undefined> &
    Partial<
        Record<
            | 'AI_MIND_AGENT_RUN_SESSION_SECRET'
            | 'AI_MIND_DEEPSEEK_API_KEY'
            | 'AI_MIND_DOUBAO_API_KEY'
            | 'AI_MIND_QWEN_API_KEY'
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

export function resolveOutboundKnownSecrets(env: WebProviderEnv = process.env): string[] {
    return [
        env.AI_MIND_AGENT_RUN_SESSION_SECRET,
        env.AI_MIND_DEEPSEEK_API_KEY,
        env.AI_MIND_DOUBAO_API_KEY,
        env.AI_MIND_QWEN_API_KEY,
        env.LANGSMITH_API_KEY,
        env.TAVILY_API_KEY,
    ]
        .map(value => value?.trim())
        .filter((value): value is string => Boolean(value))
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
