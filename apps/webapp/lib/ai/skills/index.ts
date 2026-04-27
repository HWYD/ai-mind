import { readerSkillDefinition } from './reader-skill'
import { createChatSkillRegistry, type SkillDefinition } from './registry'
import { utilitySkillDefinition } from './utility-skill'

/**
 * v0.0.11 当前固定的 Skill 注册列表。
 * 由统一 registry 对外提供 list/get，避免调用方直接依赖数组实现细节。
 */
const chatSkillDefinitions: SkillDefinition[] = [utilitySkillDefinition, readerSkillDefinition]

export const chatSkillRegistry = createChatSkillRegistry(chatSkillDefinitions)

export function getChatSkillDefinitions(): SkillDefinition[] {
    return chatSkillRegistry.list()
}

export function getActiveChatSkillDefinitions(): SkillDefinition[] {
    return chatSkillRegistry.listActive()
}

export function getChatSkillDefinition(skillId: string): SkillDefinition | undefined {
    return chatSkillRegistry.get(skillId)
}

export { readerSkillDefinition, utilitySkillDefinition }
export type {
    ChatSkillRegistry,
    SkillCapabilitySelector,
    SkillDefinition,
    SkillFallbackPolicy,
    SkillOutputPolicy,
    SkillResultPolicy,
    SkillSourceKind,
} from './registry'
