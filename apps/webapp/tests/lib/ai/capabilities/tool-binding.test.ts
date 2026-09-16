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
