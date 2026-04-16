import type { ChatRequest } from '@/lib/ai/types/chat'

import { getChatSkillDefinition } from './index'
import type { SkillDefinition } from './registry'
import { selectSkillByRules } from './routing-rules'

const INVALID_SKILL_ERROR_NAME = 'InvalidSkillError'

function createInvalidSkillError(skillName: string) {
    const error = new Error(`Skill ${skillName} 未注册或当前不可用。`)

    error.name = INVALID_SKILL_ERROR_NAME

    return error
}

function getLastUserMessageText(request: ChatRequest) {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
        const message = request.messages[index]

        if (message.role !== 'user') {
            continue
        }

        return message.parts
            .map(part => ('text' in part ? part.text : ''))
            .join('\n')
            .trim()
    }

    return ''
}

export function resolveSkillDefinitionForRequest(request: ChatRequest): SkillDefinition | undefined {
    const explicitSkillName = request.options?.skill?.trim()

    if (explicitSkillName) {
        const explicitSkill = getChatSkillDefinition(explicitSkillName)

        if (!explicitSkill || !(explicitSkill.isAvailable?.() ?? true)) {
            throw createInvalidSkillError(explicitSkillName)
        }

        return explicitSkill
    }

    const inferredSkillName = selectSkillByRules(getLastUserMessageText(request))

    if (!inferredSkillName) {
        return undefined
    }

    const inferredSkill = getChatSkillDefinition(inferredSkillName)

    if (!inferredSkill || !(inferredSkill.isAvailable?.() ?? true)) {
        return undefined
    }

    return inferredSkill
}

export function validateExplicitSkillForRequest(request: ChatRequest) {
    const explicitSkillName = request.options?.skill?.trim()

    if (!explicitSkillName) {
        return
    }

    const explicitSkill = getChatSkillDefinition(explicitSkillName)

    if (!explicitSkill || !(explicitSkill.isAvailable?.() ?? true)) {
        throw createInvalidSkillError(explicitSkillName)
    }
}
