import type { ChatSkillMode, MindMessageInput } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

// 每次请求最多携带最近 8 轮用户回合上下文，控制请求体体积，同时保留足够的短期对话记忆。
// 调大：上下文更完整但请求更重；调小：响应更轻但更容易丢失前文约束。
const MAX_CONTEXT_TURNS = 8

function toMessageInput(message: MindMessage): MindMessageInput | null {
    const parts = message.parts.filter(
        (part): part is MindMessageInput['parts'][number] => part.type === 'text' && part.text.trim().length > 0
    )

    if (parts.length === 0) {
        return null
    }

    return {
        role: message.role,
        parts: parts.map(part => ({
            type: part.type,
            text: part.text,
            format: part.format,
            ...(part.type === 'reasoning' && part.visibility ? { visibility: part.visibility } : {}),
        })),
    }
}

function toRequestMessages(messages: MindMessage[]): MindMessageInput[] {
    return messages.map(toMessageInput).filter((message): message is MindMessageInput => message !== null)
}

function getRecentContextWindow(messages: MindMessage[]): MindMessage[] {
    const systemMessages = messages.filter(message => message.role === 'system')
    const conversationalMessages = messages.filter(message => message.role !== 'system')

    if (conversationalMessages.length === 0) {
        return systemMessages
    }

    const recentMessages: MindMessage[] = []
    let userTurnCount = 0

    // 从最后一轮倒推上下文窗口，控制请求体大小，同时保留完整的最近对话关系。
    for (let index = conversationalMessages.length - 1; index >= 0; index -= 1) {
        const message = conversationalMessages[index]
        recentMessages.unshift(message)

        if (message.role === 'user') {
            userTurnCount += 1

            if (userTurnCount >= MAX_CONTEXT_TURNS) {
                break
            }
        }
    }

    return [...systemMessages, ...recentMessages]
}

export function buildRequestMessages(messages: MindMessage[]): MindMessageInput[] {
    return toRequestMessages(getRecentContextWindow(messages))
}

export function toRequestSkill(skillMode: ChatSkillMode) {
    switch (skillMode) {
        case 'utility':
            return 'utility-skill'
        case 'reader':
            return 'reader-skill'
        default:
            return undefined
    }
}
