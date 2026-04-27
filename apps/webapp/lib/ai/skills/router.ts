import type { ChatRequest } from '@/lib/ai/types/chat'

import { getChatSkillDefinition } from './index'
import type { SkillDefinition } from './registry'
import { selectSkillByRules } from './routing-rules'

const INVALID_SKILL_ERROR_NAME = 'InvalidSkillError'

function createInvalidSkillError(skillId: string) {
    const error = new Error(`Skill ${skillId} 未注册或当前不可用。`)

    error.name = INVALID_SKILL_ERROR_NAME

    return error
}

/**
 * 取最后一条用户消息文本，用于自动 skill 路由规则判断。
 */
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

/**
 * 解析请求最终使用的 Skill：
 * 1. 显式 skill 优先
 * 2. 否则走规则路由
 * 3. 都不命中则返回 undefined（走普通聊天链路）
 */
export function resolveSkillDefinitionForRequest(request: ChatRequest): SkillDefinition | undefined {
    const explicitSkillId = request.options?.skill?.trim()

    if (explicitSkillId) {
        const explicitSkill = getChatSkillDefinition(explicitSkillId)

        if (!explicitSkill || !(explicitSkill.isAvailable?.() ?? true)) {
            throw createInvalidSkillError(explicitSkillId)
        }

        return explicitSkill
    }

    const inferredSkillId = selectSkillByRules(getLastUserMessageText(request))

    if (!inferredSkillId) {
        return undefined
    }

    const inferredSkill = getChatSkillDefinition(inferredSkillId)

    if (!inferredSkill || !(inferredSkill.isAvailable?.() ?? true)) {
        return undefined
    }

    return inferredSkill
}

/**
 * 仅用于请求入口的显式 skill 校验。
 * 当用户传入非法或不可用 skill 时，提前抛错并终止请求。
 */
export function validateExplicitSkillForRequest(request: ChatRequest) {
    const explicitSkillId = request.options?.skill?.trim()

    if (!explicitSkillId) {
        return
    }

    const explicitSkill = getChatSkillDefinition(explicitSkillId)

    if (!explicitSkill || !(explicitSkill.isAvailable?.() ?? true)) {
        throw createInvalidSkillError(explicitSkillId)
    }
}
