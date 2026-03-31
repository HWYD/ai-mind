export type SkillOutputPolicy = 'concise-utility'
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
    // 预留后续扩展的输出策略标记。
    outputPolicy?: SkillOutputPolicy
    // 预留后续扩展的结果优先策略标记。
    resultPolicy?: SkillResultPolicy
    // 预留给后续 Skill 路由或调试使用的提示信息。
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
