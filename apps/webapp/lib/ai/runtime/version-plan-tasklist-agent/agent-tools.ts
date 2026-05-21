import { type ChatToolDefinition, getChatToolDefinition } from '@/lib/ai/tools'

import type { VersionPlanTasklistToolName } from './types'

const VERSION_PLAN_TASKLIST_AGENT_TOOL_NAMES: VersionPlanTasklistToolName[] = ['validate_tasklist_structure']

/**
 * v0.1.0 Agent 的工具白名单入口；普通 Skill 不会因为工具注册而自动获得这些 Agent 专属工具。
 */
export function getVersionPlanTasklistAgentToolDefinitionMap(): Map<VersionPlanTasklistToolName, ChatToolDefinition> {
    const toolDefinitionMap = new Map<VersionPlanTasklistToolName, ChatToolDefinition>()

    for (const toolName of VERSION_PLAN_TASKLIST_AGENT_TOOL_NAMES) {
        const toolDefinition = getChatToolDefinition(toolName)

        if (toolDefinition) {
            toolDefinitionMap.set(toolName, toolDefinition)
        }
    }

    return toolDefinitionMap
}

/**
 * 校验某个 tool 是否在当前 Agent scope 内，后续 ActionExecutor 会用它拦住越界工具调用。
 */
export function isVersionPlanTasklistAgentToolAllowed(toolName: string): toolName is VersionPlanTasklistToolName {
    return VERSION_PLAN_TASKLIST_AGENT_TOOL_NAMES.includes(toolName as VersionPlanTasklistToolName)
}
