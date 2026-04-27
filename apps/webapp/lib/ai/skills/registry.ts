import type { CapabilityLocation, CapabilityProviderKind, CapabilityType } from '@/lib/ai/capabilities/types'

/**
 * Skill Registry 的核心类型定义。
 * v0.0.11 起 Skill 通过结构化字段声明可承接能力范围，供 runtime 与路由层消费。
 */
export type SkillOutputPolicy = 'concise-utility' | 'context-reader'
export type SkillResultPolicy = 'tool-first'

export type SkillFallbackPolicy = 'direct-answer'
export type SkillSourceKind = CapabilityProviderKind

export interface SkillCapabilitySelector {
    capabilityIds?: string[]
    capabilityType?: CapabilityType
    location?: CapabilityLocation
    names?: string[]
    providerKind?: CapabilityProviderKind
    serverId?: string
}

export interface SkillDefinition {
    // Skill 的机器标识，供请求层和 Runtime 做映射（例如 utility-skill）。
    skillId: string
    // Skill 的展示名称，可用于中文或其他本地化名称。
    name: string
    // Skill 的自然语言描述，用于文档、调试和后续扩展。
    description: string
    // Skill 专属的系统提示词，用于约束模型的任务风格。
    systemPrompt: string
    // 当前 Skill 允许使用的 Tool 名称列表。
    allowedTools: string[]
    // 输出风格策略：当前已由 Runtime 消费，会补充额外的 system prompt 约束。
    outputPolicy?: SkillOutputPolicy
    // 结果优先策略：当前仅保留字段定义，尚未在 Runtime 中独立消费。
    resultPolicy?: SkillResultPolicy
    // 路由或调试提示：当前主要作为声明信息保留，尚未直接参与自动路由。
    routingHints?: string[]
    // 用于按环境或功能开关决定 Skill 是否可用。
    isAvailable?: () => boolean
    // 命中示例，用于路由调试和后续展示。
    triggerExamples?: string[]
    // 声明该 Skill 主要消费哪些能力来源类型。
    sourceKinds?: SkillSourceKind[]
    // 声明该 Skill 可承接的 capability 选择范围。
    capabilitySelectors?: SkillCapabilitySelector[]
    // 声明能力不可用时的回退策略。
    fallbackPolicy?: SkillFallbackPolicy
}

export interface ChatSkillRegistry {
    list(): SkillDefinition[]
    listActive(): SkillDefinition[]
    get(skillId: string): SkillDefinition | undefined
}

/**
 * 创建内存态 Skill Registry。
 * 当前版本使用静态定义数组初始化，后续可平滑扩展到配置驱动加载。
 */
export function createChatSkillRegistry(skillDefinitions: SkillDefinition[]): ChatSkillRegistry {
    const skillDefinitionMap = new Map(skillDefinitions.map(skillDefinition => [skillDefinition.skillId, skillDefinition]))

    return {
        // Registry 统一管理 Skill 定义，运行时只通过这里列出和查询 Skill。
        list() {
            return skillDefinitions
        },
        listActive() {
            return skillDefinitions.filter(skillDefinition => skillDefinition.isAvailable?.() ?? true)
        },
        get(skillId: string) {
            return skillDefinitionMap.get(skillId)
        },
    }
}
