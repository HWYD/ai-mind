import type { ToolCall, ToolMessage } from '@langchain/core/messages'

import { getChatToolDefinition } from '@/lib/ai/tools'

export interface ExecutedToolResult {
    toolCall: ToolCall
    toolMessage: ToolMessage
    output: string
    success: boolean
}

// 对确定性工具优先直出简洁答案，避免第二阶段模型重新组织时把数值或格式写乱。
export function createAuthoritativeToolAnswer(
    executedToolResults: ExecutedToolResult[],
    formatToolInput: (toolCall: ToolCall) => string
): string | null {
    if (executedToolResults.length !== 1) {
        return null
    }

    const [executedToolResult] = executedToolResults
    const toolDefinition = getChatToolDefinition(executedToolResult.toolCall.name)

    if (!toolDefinition?.resultIsAuthoritative || !executedToolResult.success || !executedToolResult.output) {
        return null
    }

    const input = formatToolInput(executedToolResult.toolCall)

    return `\`${input}\` 的结果是 **${executedToolResult.output}**。`
}
