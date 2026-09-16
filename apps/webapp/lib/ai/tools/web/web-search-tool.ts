import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from '@/lib/ai/tools/registry'
import { createTavilyWebProvider } from '@/lib/ai/tools/web/tavily-web-provider'
import type { WebProvider } from '@/lib/ai/tools/web/web-provider'

export const webSearchToolSchema = z
    .object({
        query: z.string().trim().min(1).max(500).describe('要查询的公开网页问题，不得包含 Token、Cookie、API Key 或签名 URL。'),
    })
    .strict()

export function createWebSearchToolDefinition(provider: WebProvider): ChatToolDefinition<z.infer<typeof webSearchToolSchema>> {
    const webSearchTool = tool(async ({ query }, config) => provider.search({ query, signal: config?.signal }), {
        description: '搜索当前公开网页信息，返回最多 5 个安全来源。不要在 query 中包含任何凭据或私有密钥。',
        name: 'web-search',
        schema: webSearchToolSchema,
    })

    return {
        executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
        formatInput: () => '公开网页',
        formatOutput: result => JSON.stringify(result),
        formatPublicOutput: result => {
            const count = getSearchResultCount(result)
            return `已搜索到 ${count} 个来源`
        },
        getDisplayConfig: () => ({ action: 'search', title: '网页搜索' }),
        name: 'web-search',
        runtimeScopes: ['general-react-agent'],
        schema: webSearchToolSchema,
        source: 'internal',
        tool: webSearchTool,
    }
}

const configuredWebSearchTool = tool(
    async ({ query }, config) => {
        const provider = createTavilyWebProvider()
        if (!provider) throw new Error('网页搜索服务未配置。')
        return provider.search({ query, signal: config?.signal })
    },
    {
        description: '搜索当前公开网页信息，返回最多 5 个安全来源。不要在 query 中包含任何凭据或私有密钥。',
        name: 'web-search',
        schema: webSearchToolSchema,
    }
)

export const webSearchToolDefinition: ChatToolDefinition<z.infer<typeof webSearchToolSchema>> = {
    executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
    formatInput: () => '公开网页',
    formatOutput: result => JSON.stringify(result),
    formatPublicOutput: result => `已搜索到 ${getSearchResultCount(result)} 个来源`,
    getDisplayConfig: () => ({ action: 'search', title: '网页搜索' }),
    isAvailable: () => createTavilyWebProvider() !== null,
    name: 'web-search',
    runtimeScopes: ['general-react-agent'],
    schema: webSearchToolSchema,
    source: 'internal',
    tool: configuredWebSearchTool,
}

function getSearchResultCount(result: unknown): number {
    return result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).results)
        ? Math.min((result as { results: unknown[] }).results.length, 5)
        : 0
}
