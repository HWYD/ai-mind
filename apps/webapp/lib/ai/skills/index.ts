import { createChatSkillRegistry, type SkillDefinition } from './registry'
import { utilitySkillDefinition } from './utility-skill'

const chatSkillDefinitions: SkillDefinition[] = [utilitySkillDefinition]

export const chatSkillRegistry = createChatSkillRegistry(chatSkillDefinitions)

export function getChatSkillDefinitions(): SkillDefinition[] {
    return chatSkillRegistry.list()
}

export function getActiveChatSkillDefinitions(): SkillDefinition[] {
    return chatSkillRegistry.listActive()
}

export function getChatSkillDefinition(skillName: string): SkillDefinition | undefined {
    return chatSkillRegistry.get(skillName)
}

export { utilitySkillDefinition }
export type { ChatSkillRegistry, SkillDefinition, SkillOutputPolicy, SkillResultPolicy } from './registry'
