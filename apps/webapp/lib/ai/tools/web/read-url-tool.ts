import { tool } from '@langchain/core/tools'
import { z } from 'zod'

import type { ChatToolDefinition } from '@/lib/ai/tools/registry'
import type { WebProvider } from '@/lib/ai/tools/web/web-provider'
import { createConfiguredWebProvider } from '@/lib/ai/tools/web/web-provider-factory'

export const readUrlToolSchema = z
    .object({
        url: z.string().url().describe('需要读取的公开 HTTP(S) URL；可来自用户或模型候选，执行前必须通过 URL 安全策略。'),
    })
    .strict()

export function createReadUrlToolDefinition(provider: WebProvider): ChatToolDefinition<z.infer<typeof readUrlToolSchema>> {
    const readUrlTool = tool(async ({ url }, config) => provider.read({ url, signal: config?.signal }), {
        description: '读取通过公开 URL 安全策略的网页。URL 可来自用户或模型候选。',
        name: 'read-url',
        schema: readUrlToolSchema,
    })

    return createDefinition(readUrlTool)
}

const configuredReadUrlTool = tool(
    async ({ url }, config) => {
        const provider = createConfiguredWebProvider()
        if (!provider) throw new Error('网页读取服务未配置。')
        return provider.read({ url, signal: config?.signal })
    },
    {
        description: '读取通过公开 URL 安全策略的网页。URL 可来自用户或模型候选。',
        name: 'read-url',
        schema: readUrlToolSchema,
    }
)

export const readUrlToolDefinition: ChatToolDefinition<z.infer<typeof readUrlToolSchema>> = {
    ...createDefinition(configuredReadUrlTool),
    isAvailable: () => createConfiguredWebProvider() !== null,
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
