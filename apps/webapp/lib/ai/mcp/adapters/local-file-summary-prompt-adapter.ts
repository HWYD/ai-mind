import { mcpClientManager } from '@/lib/ai/mcp/client/mcp-client-manager'
import { MCPHostError } from '@/lib/ai/mcp/protocol/errors'
import type { MCPPromptAdapterResult } from '@/lib/ai/mcp/protocol/types'

import type { MCPPromptAdapter } from './types'

const PROJECT_FILES_SERVER_ID = 'project-files-server'
const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary'

export interface LocalFileSummaryPromptAdapterInput {
    filename: string
    content: string
    userGoal?: string
}

function normalizePromptArgs(input: LocalFileSummaryPromptAdapterInput) {
    const filename = input.filename.trim()
    const content = input.content.trim()
    const userGoal = input.userGoal?.trim()

    if (!filename) {
        throw new MCPHostError('REQUEST_FAILED', 'local-file-summary 缺少 filename 参数。')
    }

    if (!content) {
        throw new MCPHostError('REQUEST_FAILED', 'local-file-summary 缺少 content 参数。')
    }

    return {
        filename,
        content,
        userGoal,
    }
}

/**
 * `local-file-summary` 的本地 MCP Prompt 适配器。
 * 统一负责参数整理、调用 prompts/get，以及把返回结构转换为 runtime 可消费结果。
 */
export const localFileSummaryPromptAdapter: MCPPromptAdapter<LocalFileSummaryPromptAdapterInput> = {
    async get(input): Promise<MCPPromptAdapterResult> {
        const normalizedInput = normalizePromptArgs(input)
        const response = await mcpClientManager.getPrompt(PROJECT_FILES_SERVER_ID, {
            name: LOCAL_FILE_SUMMARY_PROMPT_NAME,
            arguments: {
                filename: normalizedInput.filename,
                content: normalizedInput.content,
                ...(normalizedInput.userGoal ? { userGoal: normalizedInput.userGoal } : {}),
            },
        })

        if (!response.result.messages || response.result.messages.length === 0) {
            throw new MCPHostError('REQUEST_FAILED', 'local-file-summary 没有返回可用 prompt 消息。')
        }

        return {
            description: response.result.description,
            messages: response.result.messages,
            promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
            serverId: PROJECT_FILES_SERVER_ID,
        }
    },
}
