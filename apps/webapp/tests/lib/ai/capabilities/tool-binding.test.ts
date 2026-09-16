import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { resolveGeneralToolBinding, toCapabilityDefinition } from '@/lib/ai/capabilities'
import type { ChatToolDefinition } from '@/lib/ai/tools'

const mcpClientManagerMock = vi.hoisted(() => ({
    callTool: vi.fn(),
    listTools: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/client/mcp-client-manager', () => ({
    mcpClientManager: mcpClientManagerMock,
}))

describe('capabilities/tool-binding', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    beforeEach(() => {
        mcpClientManagerMock.callTool.mockReset()
        mcpClientManagerMock.listTools.mockReset()
        mcpClientManagerMock.listTools.mockResolvedValue({
            serverDefinition: {
                serverId: 'project-assistant-service',
            },
            tools: [
                {
                    description: '检查版本方案、tasklist 和公开文档之间是否存在明显不一致。',
                    inputSchema: {
                        properties: {
                            focus: {
                                type: 'string',
                            },
                        },
                        required: ['focus'],
                        type: 'object',
                    },
                    name: 'check_doc_consistency',
                    title: '文档一致性检查',
                },
            ],
        })
    })

    it('resolves the fixed General Tool policy without remote MCP discovery', async () => {
        vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key')

        const binding = await resolveGeneralToolBinding()

        expect(binding.activeToolNames.sort()).toEqual([
            'calculator',
            'city-weather',
            'datetime',
            'read-url',
            'text-transform',
            'unit-convert',
            'web-search',
        ])
        expect(binding.activeToolDefinitionMap.size).toBe(7)
        expect(binding.activeToolCapabilityIds['city-weather']).toBe('mcp:local:tool:weather-server:city-weather')
        expect(mcpClientManagerMock.listTools).not.toHaveBeenCalled()
    })

    it('uses the same fixed Web Tool set when Zhipu Search-Std is selected', async () => {
        vi.stubEnv('AI_MIND_WEB_PROVIDER', 'zhipu')
        vi.stubEnv('AI_MIND_ZHIPU_API_KEY', 'test-zhipu-key')
        vi.stubEnv('AI_MIND_ZHIPU_SEARCH_ENGINE', 'search_std')

        const binding = await resolveGeneralToolBinding()

        expect(binding.activeToolNames.sort()).toEqual([
            'calculator',
            'city-weather',
            'datetime',
            'read-url',
            'text-transform',
            'unit-convert',
            'web-search',
        ])
    })

    it('在本轮 binding 后冻结 Web provider，不因环境变更而切换', async () => {
        const fetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
            async () =>
                new Response(JSON.stringify({ results: [{ content: 'snippet', title: 'Result', url: 'https://example.com/result' }] }), {
                    headers: { 'Content-Type': 'application/json' },
                })
        )
        vi.stubGlobal('fetch', fetch)
        vi.stubEnv('TAVILY_API_KEY', 'test-tavily-key')

        const binding = await resolveGeneralToolBinding()
        vi.stubEnv('AI_MIND_WEB_PROVIDER', 'zhipu')
        vi.stubEnv('AI_MIND_ZHIPU_API_KEY', 'test-zhipu-key')
        vi.stubEnv('AI_MIND_ZHIPU_SEARCH_ENGINE', 'search_std')

        await binding.activeToolDefinitionMap.get('web-search')!.tool.invoke({ query: 'current news' })

        expect(fetch.mock.calls[0]?.[0]).toBe('https://api.tavily.com/search')
    })

    it('keeps generic binding free of dedicated agent tools', async () => {
        const binding = await resolveGeneralToolBinding()

        expect(binding.activeToolNames).not.toContain('delegate-review-group')
        expect(binding.activeTools.every(toolDefinition => toolDefinition.executionPolicy.kind === 'standard-tool')).toBe(true)
    })

    it('does not expose undeclared remote MCP tools even when discovery would return one', async () => {
        const binding = await resolveGeneralToolBinding()

        expect(binding.activeToolNames).not.toContain('check_doc_consistency')
        expect(mcpClientManagerMock.listTools).not.toHaveBeenCalled()
    })

    it('keeps ChatToolDefinition capability type as tool even when rendered as resource', () => {
        const resourceRenderedToolDefinition = {
            name: 'resource-rendered-tool',
            outputPartType: 'resource',
            schema: z.unknown(),
            tool: {
                description: 'A tool that prefers resource rendering.',
            },
        } as unknown as ChatToolDefinition

        expect(toCapabilityDefinition(resourceRenderedToolDefinition).capabilityType).toBe('tool')
    })
})
