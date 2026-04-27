import type { MCPServerId } from '@/lib/ai/mcp/protocol/types'
import { mcpServerRegistry } from '@/lib/ai/mcp/registry/mcp-server-registry'
import { type ChatToolDefinition, getActiveChatToolDefinitions, getChatToolDefinitions } from '@/lib/ai/tools'

import { buildCapabilityId } from './id'
import type { CapabilityDefinition, CapabilityIdentity } from './types'

/**
 * 把静态声明的 capability identity 补齐为统一描述对象。
 * v0.0.11 只登记本版固定能力，不做动态 MCP discovery，避免提前引入额外运行时复杂度。
 */
function createStaticCapabilityDefinition(
    identity: CapabilityIdentity,
    detail: Pick<CapabilityDefinition, 'description' | 'title'> & Partial<Pick<CapabilityDefinition, 'availability'>>
): CapabilityDefinition {
    return {
        ...identity,
        availability: detail.availability ?? 'available',
        capabilityId: buildCapabilityId(identity),
        description: detail.description,
        title: detail.title,
    }
}

const staticCapabilityDefinitions: CapabilityDefinition[] = [
    createStaticCapabilityDefinition(
        {
            capabilityType: 'prompt',
            location: 'local',
            name: 'local-file-summary',
            providerKind: 'mcp',
            serverId: 'project-files-server',
        },
        {
            title: 'local-file-summary',
            description: '对已读取的单个本地项目文件生成结构化摘要 Prompt。',
        }
    ),
    createStaticCapabilityDefinition(
        {
            capabilityType: 'resource',
            location: 'remote',
            name: 'latest-context',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
        },
        {
            title: 'latest-context',
            description: '提供当前项目文档管理所需的最小 remote mock 上下文。',
        }
    ),
    createStaticCapabilityDefinition(
        {
            capabilityType: 'prompt',
            location: 'remote',
            name: 'tasklist-draft',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
        },
        {
            title: 'tasklist-draft',
            description: '提供生成 tasklist 草稿的 remote mock Prompt。',
        }
    ),
    createStaticCapabilityDefinition(
        {
            capabilityType: 'tool',
            location: 'remote',
            name: 'check_doc_consistency',
            providerKind: 'mcp',
            serverId: 'project-assistant-service',
        },
        {
            title: 'check_doc_consistency',
            description: '提供文档一致性检查的 remote mock Tool。',
        }
    ),
]

/**
 * 把单个 Tool Definition 转成统一 Capability Definition。
 */
export function toCapabilityDefinition(toolDefinition: ChatToolDefinition): CapabilityDefinition {
    const providerKind = toolDefinition.source ?? 'internal'
    const capabilityType = toolDefinition.outputPartType ?? 'tool'
    const location =
        providerKind === 'mcp' && toolDefinition.serverId
            ? (mcpServerRegistry.get(toolDefinition.serverId as MCPServerId)?.location ?? 'local')
            : 'local'
    const description = toolDefinition.tool.description?.trim() || `${toolDefinition.name} capability`
    const availability = toolDefinition.isAvailable?.() === false ? 'disabled' : 'available'
    const identity = {
        name: toolDefinition.name,
        capabilityType,
        providerKind,
        location,
        serverId: toolDefinition.serverId,
    } as const

    return {
        ...identity,
        capabilityId: buildCapabilityId(identity),
        title: toolDefinition.name,
        description,
        availability,
    }
}

/**
 * 返回当前注册表中的全部 capability（包含不可用能力）。
 */
export function getChatCapabilityDefinitions() {
    return [...getChatToolDefinitions().map(toCapabilityDefinition), ...staticCapabilityDefinitions]
}

/**
 * 返回当前可用 capability（用于运行时候选能力集合）。
 */
export function getActiveChatCapabilityDefinitions() {
    return [...getActiveChatToolDefinitions().map(toCapabilityDefinition), ...staticCapabilityDefinitions]
}

/**
 * 按 capabilityId 查询单个 capability。
 */
export function getChatCapabilityDefinitionById(capabilityId: string) {
    return getChatCapabilityDefinitions().find(capabilityDefinition => capabilityDefinition.capabilityId === capabilityId)
}
