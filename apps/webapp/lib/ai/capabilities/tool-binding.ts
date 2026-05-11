import { getRemoteMcpToolDefinition } from '@/lib/ai/mcp/adapters'
import type { MCPServerId } from '@/lib/ai/mcp/protocol/types'
import type { SkillCapabilitySelector, SkillDefinition } from '@/lib/ai/skills'
import { type ChatToolDefinition, chatToolRegistry } from '@/lib/ai/tools'

import { getActiveChatCapabilityDefinitions, toCapabilityDefinition } from './catalog'
import type { CapabilityDefinition } from './types'

const REMOTE_TOOL_DISCOVERY_TIMEOUT_MS = 1200
const REMOTE_TOOL_DISCOVERY_COOLDOWN_MS = 30_000
const REMOTE_TOOL_DISCOVERY_TIMEOUT = Symbol('REMOTE_TOOL_DISCOVERY_TIMEOUT')

const remoteToolDiscoveryUnavailableUntilMap = new Map<MCPServerId, number>()

export interface ResolvedActiveToolDefinition {
    capabilityId: string
    modelToolName: string
    toolDefinition: ChatToolDefinition
}

export interface ResolvedToolBinding {
    activeToolCapabilityIds: Record<string, string>
    activeToolDefinitionMap: Map<string, ChatToolDefinition>
    activeToolNames: string[]
    activeTools: ChatToolDefinition[]
}

function matchesSelector(capabilityDefinition: CapabilityDefinition, selector: SkillCapabilitySelector) {
    if (selector.capabilityIds && !selector.capabilityIds.includes(capabilityDefinition.capabilityId)) {
        return false
    }

    if (selector.providerKind && selector.providerKind !== capabilityDefinition.providerKind) {
        return false
    }

    if (selector.location && selector.location !== capabilityDefinition.location) {
        return false
    }

    if (selector.serverId && selector.serverId !== capabilityDefinition.serverId) {
        return false
    }

    if (selector.capabilityType && selector.capabilityType !== capabilityDefinition.capabilityType) {
        return false
    }

    if (selector.names && !selector.names.includes(capabilityDefinition.name)) {
        return false
    }

    return true
}

function isRemoteToolDiscoveryInCooldown(serverId: MCPServerId) {
    const unavailableUntil = remoteToolDiscoveryUnavailableUntilMap.get(serverId)

    if (!unavailableUntil) {
        return false
    }

    if (Date.now() < unavailableUntil) {
        return true
    }

    remoteToolDiscoveryUnavailableUntilMap.delete(serverId)
    return false
}

function markRemoteToolDiscoveryUnavailable(serverId: MCPServerId) {
    remoteToolDiscoveryUnavailableUntilMap.set(serverId, Date.now() + REMOTE_TOOL_DISCOVERY_COOLDOWN_MS)
}

async function getRemoteMcpToolDefinitionFast(serverId: MCPServerId, toolName: string) {
    if (isRemoteToolDiscoveryInCooldown(serverId)) {
        return undefined
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
        const result = await Promise.race([
            getRemoteMcpToolDefinition(serverId, toolName),
            new Promise<typeof REMOTE_TOOL_DISCOVERY_TIMEOUT>(resolve => {
                timeoutId = setTimeout(() => resolve(REMOTE_TOOL_DISCOVERY_TIMEOUT), REMOTE_TOOL_DISCOVERY_TIMEOUT_MS)
            }),
        ])

        if (result === REMOTE_TOOL_DISCOVERY_TIMEOUT) {
            markRemoteToolDiscoveryUnavailable(serverId)
            return undefined
        }

        return result
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
    }
}

async function resolveToolDefinition(capabilityDefinition: CapabilityDefinition) {
    if (capabilityDefinition.capabilityType !== 'tool') {
        return undefined
    }

    const shouldResolveRemoteMcpTool =
        capabilityDefinition.providerKind === 'mcp' && capabilityDefinition.location === 'remote' && capabilityDefinition.serverId

    let toolDefinition: ChatToolDefinition | undefined

    if (shouldResolveRemoteMcpTool) {
        const serverId = capabilityDefinition.serverId as MCPServerId

        try {
            toolDefinition = await getRemoteMcpToolDefinitionFast(serverId, capabilityDefinition.name)
        } catch {
            markRemoteToolDiscoveryUnavailable(serverId)
            // Remote tool discovery happens before any visible tool part exists; fail closed so resource/prompt and普通问答链路不被拖垮。
            return undefined
        }

        if (!toolDefinition) {
            return undefined
        }
    } else {
        toolDefinition = chatToolRegistry.get(capabilityDefinition.name)
    }

    if (!toolDefinition) {
        return undefined
    }

    const resolvedCapabilityId = toCapabilityDefinition(toolDefinition).capabilityId

    if (resolvedCapabilityId !== capabilityDefinition.capabilityId) {
        throw new Error(
            `Tool binding conflict: capability "${capabilityDefinition.capabilityId}" resolved to tool "${toolDefinition.name}" with mismatched capabilityId "${resolvedCapabilityId}".`
        )
    }

    return toolDefinition
}

function createEmptyToolBinding(): ResolvedToolBinding {
    return {
        activeToolCapabilityIds: {},
        activeToolDefinitionMap: new Map(),
        activeToolNames: [],
        activeTools: [],
    }
}

/**
 * 根据 Skill 声明的 capabilitySelectors 解析本轮可绑定工具。
 * 这里故意只返回已经能映射到 ChatToolDefinition 的 tool capability：
 * Resource / Prompt 不进入模型 tool binding，Step 3 前 remote MCP Tool 也不会被提前暴露给模型。
 */
export async function resolveToolBindingForSkill(skillDefinition?: SkillDefinition): Promise<ResolvedToolBinding> {
    if (!skillDefinition?.capabilitySelectors?.length) {
        return createEmptyToolBinding()
    }

    const resolvedToolMap = new Map<string, ResolvedActiveToolDefinition>()

    for (const capabilityDefinition of getActiveChatCapabilityDefinitions()) {
        if (!skillDefinition.capabilitySelectors.some(selector => matchesSelector(capabilityDefinition, selector))) {
            continue
        }

        const toolDefinition = await resolveToolDefinition(capabilityDefinition)

        if (!toolDefinition) {
            continue
        }

        const modelToolName = toolDefinition.name
        const existingResolvedTool = resolvedToolMap.get(modelToolName)

        if (existingResolvedTool && existingResolvedTool.capabilityId !== capabilityDefinition.capabilityId) {
            throw new Error(`Tool binding conflict: model tool name "${modelToolName}" maps to multiple capabilityIds.`)
        }

        resolvedToolMap.set(modelToolName, {
            capabilityId: capabilityDefinition.capabilityId,
            modelToolName,
            toolDefinition,
        })
    }

    const resolvedTools = [...resolvedToolMap.values()]

    return {
        activeToolCapabilityIds: Object.fromEntries(
            resolvedTools.map(resolvedTool => [resolvedTool.modelToolName, resolvedTool.capabilityId])
        ),
        activeToolDefinitionMap: new Map(resolvedTools.map(resolvedTool => [resolvedTool.modelToolName, resolvedTool.toolDefinition])),
        activeToolNames: resolvedTools.map(resolvedTool => resolvedTool.modelToolName),
        activeTools: resolvedTools.map(resolvedTool => resolvedTool.toolDefinition),
    }
}
