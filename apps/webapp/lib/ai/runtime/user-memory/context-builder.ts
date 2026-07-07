import type { BaseMessage } from '@langchain/core/messages'
import { SystemMessage } from '@langchain/core/messages'

import { getUserMemoryRuntimeConfig, type UserMemoryRuntimeConfig } from './runtime-config'
import type { SelectedUserMemory } from './state-schema'
import { clipUserMemoryText } from './validation'

export function buildUserMemoryContextMessages(
    selectedMemories: SelectedUserMemory[],
    config: UserMemoryRuntimeConfig = getUserMemoryRuntimeConfig()
): BaseMessage[] {
    if (selectedMemories.length === 0) {
        return []
    }

    const memoryLines: string[] = []
    let totalChars = 0

    for (const memory of selectedMemories.slice(0, config.maxSelectedMemories)) {
        const text = clipUserMemoryText(memory.text, config.maxMemoryChars)

        if (!text) {
            continue
        }

        if (totalChars + text.length > config.maxTotalChars) {
            break
        }

        memoryLines.push(`- (${memory.type}) ${text}`)
        totalChars += text.length
    }

    if (totalChars === 0 || memoryLines.length === 0) {
        return []
    }

    return [
        new SystemMessage(
            [
                '以下是当前 browser session 的长期用户记忆补充上下文。',
                '只在与当前问题相关时参考；如果与 latest user message 冲突，以 latest user message 为准。',
                '',
                ...memoryLines,
            ].join('\n')
        ),
    ]
}
