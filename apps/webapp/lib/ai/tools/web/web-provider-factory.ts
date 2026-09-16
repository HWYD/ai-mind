import { createTavilyWebProvider } from '@/lib/ai/tools/web/tavily-web-provider'
import type { WebProvider } from '@/lib/ai/tools/web/web-provider'
import { resolveZhipuWebProviderConfig, type WebProviderEnv } from '@/lib/ai/tools/web/web-provider-config'
import { createZhipuWebProvider } from '@/lib/ai/tools/web/zhipu-web-provider'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function createConfiguredWebProvider(options: { env?: WebProviderEnv; fetch?: FetchLike } = {}): WebProvider | null {
    const selectedProvider = (options.env ?? process.env).AI_MIND_WEB_PROVIDER?.trim().toLowerCase() || 'tavily'
    if (selectedProvider === 'tavily') {
        return createTavilyWebProvider(options)
    }
    if (selectedProvider === 'zhipu') {
        const config = resolveZhipuWebProviderConfig(options.env)
        return config ? createZhipuWebProvider({ config, fetch: options.fetch }) : null
    }
    return null
}
