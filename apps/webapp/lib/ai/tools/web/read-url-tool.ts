import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from '@/lib/ai/tools/registry'
import { createTavilyWebProvider } from '@/lib/ai/tools/web/tavily-web-provider'
import type { WebProvider } from '@/lib/ai/tools/web/web-provider'

export const readUrlToolSchema = z
    .object({
        url: z.string().url().describe('当前请求中由用户提供或 web-search 返回的一个已授权 HTTP(S) URL。'),
    })
    .strict()

export function createReadUrlToolDefinition(provider: WebProvider): ChatToolDefinition<z.infer<typeof readUrlToolSchema>> {
    const readUrlTool = tool(async ({ url }, config) => provider.read({ url, signal: config?.signal }), {
        description: '读取当前请求中已授权的一个公开网页。URL 必须来自用户当前消息或本轮 web-search 结果。',
        name: 'read-url',
        schema: readUrlToolSchema,
    })

    return createDefinition(readUrlTool)
}

const configuredReadUrlTool = tool(
    async ({ url }, config) => {
        const provider = createTavilyWebProvider()
        if (!provider) throw new Error('网页读取服务未配置。')
        return provider.read({ url, signal: config?.signal })
    },
    {
        description: '读取当前请求中已授权的一个公开网页。URL 必须来自用户当前消息或本轮 web-search 结果。',
        name: 'read-url',
        schema: readUrlToolSchema,
    }
)

export const readUrlToolDefinition: ChatToolDefinition<z.infer<typeof readUrlToolSchema>> = {
    ...createDefinition(configuredReadUrlTool),
    isAvailable: () => createTavilyWebProvider() !== null,
}

function createDefinition(toolInstance: typeof configuredReadUrlTool): ChatToolDefinition<z.infer<typeof readUrlToolSchema>> {
    return {
        executionPolicy: { attemptTimeoutMs: 20_000, kind: 'standard-tool', profile: 'remote-readonly', retrySafe: true },
        formatInput: () => '已授权页面',
        formatOutput: result => JSON.stringify(result),
        formatPublicOutput: () => '已读取页面',
        getDisplayConfig: () => ({ action: 'read', title: '读取页面' }),
        name: 'read-url',
        runtimeScopes: ['general-react-agent'],
        schema: readUrlToolSchema,
        source: 'internal',
        tool: toolInstance,
    }
}
