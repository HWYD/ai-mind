import { type ChatToolDefinition, getChatToolDefinitionsForScope, toolSupportsRuntimeScope } from '@/lib/ai/tools'
import { createReadUrlToolDefinition } from '@/lib/ai/tools/web/read-url-tool'
import { createConfiguredWebProvider } from '@/lib/ai/tools/web/web-provider-factory'
import { createWebSearchToolDefinition } from '@/lib/ai/tools/web/web-search-tool'

import { toCapabilityDefinition } from './catalog'

/**
 * General ReAct 的工具面由 Runtime 的独立策略管理，不能从 Skill 声明派生。
 * 后续新增工具需要同时评审安全性、可观测性与 General ReAct 适配性，再显式加入此策略。
 */
const GENERAL_REACT_TOOL_NAMES = new Set([
    'calculator',
    'datetime',
    'text-transform',
    'unit-convert',
    'read-url',
    'web-search',
    'city-weather',
])

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

/**
 * 解析本轮 General ReAct 的固定工具策略。
 *
 * Skill 只补充 prompt 和输出风格，不能改变工具可见性，更不会触发远程 MCP Tool 发现。
 */
export async function resolveGeneralToolBinding(): Promise<ResolvedToolBinding> {
    const resolvedToolMap = new Map<string, ResolvedActiveToolDefinition>()
    const webProvider = createConfiguredWebProvider()

    for (const toolDefinition of getChatToolDefinitionsForScope('general-react-agent')) {
        if (!GENERAL_REACT_TOOL_NAMES.has(toolDefinition.name)) {
            continue
        }

        if (toolDefinition.executionPolicy.kind !== 'standard-tool' || !toolSupportsRuntimeScope(toolDefinition, 'general-react-agent')) {
            continue
        }

        const resolvedToolDefinition = resolveGeneralToolDefinition(toolDefinition, webProvider)
        if (!resolvedToolDefinition) {
            continue
        }

        const capabilityDefinition = toCapabilityDefinition(resolvedToolDefinition)
        resolvedToolMap.set(toolDefinition.name, {
            capabilityId: capabilityDefinition.capabilityId,
            modelToolName: toolDefinition.name,
            toolDefinition: resolvedToolDefinition,
        })
    }

    return createResolvedToolBinding(resolvedToolMap)
}

function resolveGeneralToolDefinition(toolDefinition: ChatToolDefinition, webProvider: ReturnType<typeof createConfiguredWebProvider>) {
    if (toolDefinition.name === 'web-search') {
        return webProvider ? createWebSearchToolDefinition(webProvider) : null
    }
    if (toolDefinition.name === 'read-url') {
        return webProvider ? createReadUrlToolDefinition(webProvider) : null
    }
    return toolDefinition.isAvailable?.() === false ? null : toolDefinition
}

function createResolvedToolBinding(resolvedToolMap: Map<string, ResolvedActiveToolDefinition>): ResolvedToolBinding {
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
