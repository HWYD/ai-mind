export type SkillOutputPolicy = 'concise-utility' | 'context-reader'
export type SkillResultPolicy = 'tool-first'

export interface SkillDefinition {
    // Skill 唯一标识，供请求层和 Runtime 做映射。
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
}

export interface ChatSkillRegistry {
    list(): SkillDefinition[]
    listActive(): SkillDefinition[]
    get(name: string): SkillDefinition | undefined
}

export function createChatSkillRegistry(skillDefinitions: SkillDefinition[]): ChatSkillRegistry {
    const skillDefinitionMap = new Map(skillDefinitions.map(skillDefinition => [skillDefinition.name, skillDefinition]))

    return {
        // Registry 统一管理 Skill 定义，运行时只通过这里列出和查询 Skill。
        list() {
            return skillDefinitions
        },
        listActive() {
            return skillDefinitions.filter(skillDefinition => skillDefinition.isAvailable?.() ?? true)
        },
        get(name: string) {
            return skillDefinitionMap.get(name)
        },
    }
}
