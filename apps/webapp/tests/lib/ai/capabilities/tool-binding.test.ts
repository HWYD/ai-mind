import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { resolveToolBindingForSkill, toCapabilityDefinition } from '@/lib/ai/capabilities'
import { readerSkillDefinition, utilitySkillDefinition } from '@/lib/ai/skills'
import type { ChatToolDefinition } from '@/lib/ai/tools'

const mcpClientManagerMock = vi.hoisted(() => ({
    callTool: vi.fn(),
    listTools: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/client/mcp-client-manager', () => ({
    mcpClientManager: mcpClientManagerMock,
}))

describe('capabilities/tool-binding', () => {
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

    it('binds only utility internal tools for utility-skill', async () => {
        const binding = await resolveToolBindingForSkill(utilitySkillDefinition)
        const activeToolNames = [...binding.activeToolNames].sort()

        expect(activeToolNames).toEqual(['calculator', 'datetime', 'text-transform', 'unit-convert'])
        expect([...binding.activeToolDefinitionMap.keys()].sort()).toEqual(activeToolNames)
        expect(binding.activeToolCapabilityIds.calculator).toBe('internal:local:tool:calculator')
        expect(mcpClientManagerMock.listTools).not.toHaveBeenCalled()
    })

    it('binds available local and remote tool capabilities for reader-skill', async () => {
        const binding = await resolveToolBindingForSkill(readerSkillDefinition)
        const activeToolNames = [...binding.activeToolNames].sort()

        expect(activeToolNames).toEqual(['check_doc_consistency', 'city-weather'])
        expect(binding.activeToolCapabilityIds['city-weather']).toBe('mcp:local:tool:weather-server:city-weather')
        expect(binding.activeToolCapabilityIds.check_doc_consistency).toBe(
            'mcp:remote:tool:project-assistant-service:check_doc_consistency'
        )
        expect(binding.activeToolDefinitionMap.get('check_doc_consistency')?.source).toBe('mcp')
        expect(binding.activeToolDefinitionMap.get('check_doc_consistency')?.serverId).toBe('project-assistant-service')
    })

    it('does not bind tools without a selected skill', async () => {
        const binding = await resolveToolBindingForSkill()

        expect(binding.activeTools).toEqual([])
        expect(binding.activeToolNames).toEqual([])
        expect(binding.activeToolDefinitionMap.size).toBe(0)
        expect(mcpClientManagerMock.listTools).not.toHaveBeenCalled()
    })

    it('skips remote MCP tools when discovery fails without breaking local reader tools', async () => {
        mcpClientManagerMock.listTools.mockRejectedValueOnce(new Error('remote discovery failed'))

        const binding = await resolveToolBindingForSkill(readerSkillDefinition)

        expect(binding.activeToolNames).toEqual(['city-weather'])
        expect(binding.activeToolDefinitionMap.has('check_doc_consistency')).toBe(false)
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
