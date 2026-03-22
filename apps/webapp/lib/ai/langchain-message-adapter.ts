import { AIMessage, type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

import type { MindMessageInput } from './types/chat'

function flattenInputParts(parts: MindMessageInput['parts']): string {
    return parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n\n')
        .trim()
}

// 第一阶段只把 text part 发送给模型，其他 part 类型先保留扩展位。
export function toLangChainMessages(messages: MindMessageInput[]): BaseMessage[] {
    const result: BaseMessage[] = []

    for (const message of messages) {
        const content = flattenInputParts(message.parts)

        if (!content) {
            continue
        }

        switch (message.role) {
            case 'system':
                result.push(new SystemMessage(content))
                break
            case 'assistant':
                result.push(new AIMessage(content))
                break
            case 'user':
            default:
                result.push(new HumanMessage(content))
                break
        }
    }

    return result
}
