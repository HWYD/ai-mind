import { AIMessage, type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

import type { AiMindThreadState, ChatThreadMessage } from './state-schema'

function toRecentMessage(message: ChatThreadMessage): BaseMessage {
    return message.role === 'user' ? new HumanMessage(message.text) : new AIMessage(message.text)
}

export function buildChatMemoryContextMessages(state: AiMindThreadState): BaseMessage[] {
    const messages: BaseMessage[] = []
    const summary = state.summary.trim()

    if (summary) {
        messages.push(
            new SystemMessage(
                [
                    '以下是当前聊天会话中较早内容的压缩摘要，仅作为连续对话背景使用。',
                    '不要向用户暴露这是内部 memory summary。',
                    summary,
                ].join('\n')
            )
        )
    }

    if (state.pinnedDecisions.length > 0) {
        messages.push(
            new SystemMessage(
                [
                    '以下是当前聊天会话中需要持续遵守的 pinned decisions。',
                    ...state.pinnedDecisions.map((decision, index) => `${index + 1}. ${decision}`),
                ].join('\n')
            )
        )
    }

    return [...messages, ...state.messages.map(toRecentMessage)]
}
