import { AIMessage, type BaseMessage, HumanMessage, type ToolCall } from '@langchain/core/messages'

import { localFileSummaryPromptAdapter, projectFileResourceAdapter } from '@/lib/ai/mcp/adapters'
import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ExecutedToolResult } from './types'

const LOCAL_FILE_SUMMARY_INTENT_REGEX =
    /(\u603b\u7ed3|\u6458\u8981|\u6982\u89c8|\u68b3\u7406|\u91cd\u70b9|\u63d0\u70bc|\u5f52\u7eb3|\u89e3\u8bfb|\u5206\u6790|summary|summarize|overview|highlights?|key points?)/i
const LOCAL_FILE_SUMMARY_PROMPT_NAME = 'local-file-summary'
const LOCAL_FILE_SUMMARY_SERVER_ID = 'project-files-server'

type PromptRuntimeErrorCode = 'PROMPT_FETCH_FAILED' | 'PROMPT_INJECTION_FAILED'

export class PromptRuntimeError extends Error {
    code: PromptRuntimeErrorCode
    promptName: string
    serverId: string

    constructor(code: PromptRuntimeErrorCode, message: string, options: { promptName: string; serverId: string }) {
        super(message)
        this.name = 'PromptRuntimeError'
        this.code = code
        this.promptName = options.promptName
        this.serverId = options.serverId
    }
}

export interface PromptContextInvocation {
    input: string
    location: 'local'
    promptName: string
    serverId: string
    source: 'mcp'
    execute: () => Promise<BaseMessage[]>
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

function shouldUseLocalFileSummaryPrompt(userGoal: string) {
    return LOCAL_FILE_SUMMARY_INTENT_REGEX.test(userGoal)
}

function getLocalTextReadFilename(toolCall: ToolCall) {
    if (!toolCall.args || typeof toolCall.args !== 'object' || !('filename' in toolCall.args)) {
        return null
    }

    const filename = (toolCall.args as { filename?: unknown }).filename

    if (typeof filename !== 'string' || filename.trim().length === 0) {
        return null
    }

    return filename.trim()
}

function getLatestSuccessfulLocalTextReadResult(executedToolResults: ExecutedToolResult[]) {
    for (let index = executedToolResults.length - 1; index >= 0; index -= 1) {
        const result = executedToolResults[index]

        if (!result.success) {
            continue
        }

        if (result.toolCall.name !== 'local-text-read') {
            continue
        }

        return result
    }

    return null
}

function toPromptContextMessages(messages: Awaited<ReturnType<typeof localFileSummaryPromptAdapter.get>>['messages']) {
    const contextMessages: BaseMessage[] = []

    for (const message of messages) {
        if (message.content.type !== 'text') {
            continue
        }

        const text = message.content.text.trim()

        if (!text) {
            continue
        }

        if (message.role === 'assistant') {
            contextMessages.push(new AIMessage(text))
            continue
        }

        contextMessages.push(new HumanMessage(text))
    }

    return contextMessages
}

function formatPromptInvocationInput(filename: string, userGoal: string) {
    return `filename=${filename}\nuserGoal=${userGoal}`
}

async function buildLocalSummaryPromptContextMessages(filename: string, userGoal: string) {
    let fileContent: string

    try {
        const resourceResult = await projectFileResourceAdapter.read({
            filename,
        })
        fileContent = resourceResult.content
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read local file content.'
        throw new PromptRuntimeError('PROMPT_FETCH_FAILED', `local-file-summary failed to read file content: ${message}`, {
            promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
            serverId: LOCAL_FILE_SUMMARY_SERVER_ID,
        })
    }

    try {
        const promptResult = await localFileSummaryPromptAdapter.get({
            filename,
            content: fileContent,
            userGoal,
        })
        const promptMessages = toPromptContextMessages(promptResult.messages)

        if (promptMessages.length === 0) {
            throw new PromptRuntimeError('PROMPT_INJECTION_FAILED', 'local-file-summary returned no injectable text message.', {
                promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
                serverId: LOCAL_FILE_SUMMARY_SERVER_ID,
            })
        }

        return promptMessages
    } catch (error) {
        if (error instanceof PromptRuntimeError) {
            throw error
        }

        const message = error instanceof Error ? error.message : 'Failed to fetch local-file-summary prompt.'
        throw new PromptRuntimeError('PROMPT_FETCH_FAILED', `local-file-summary fetch failed: ${message}`, {
            promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
            serverId: LOCAL_FILE_SUMMARY_SERVER_ID,
        })
    }
}

/**
 * Resolve whether the current turn should inject prompt context.
 * v0.0.11 currently only supports `local-file-summary`.
 */
export function resolvePromptContextInvocation(
    request: ChatRequest,
    executedToolResults: ExecutedToolResult[]
): PromptContextInvocation | null {
    const userGoal = getLastUserMessageText(request)

    if (!shouldUseLocalFileSummaryPrompt(userGoal)) {
        return null
    }

    const localTextReadResult = getLatestSuccessfulLocalTextReadResult(executedToolResults)

    if (!localTextReadResult) {
        return null
    }

    const filename = getLocalTextReadFilename(localTextReadResult.toolCall)

    if (!filename) {
        return null
    }

    return {
        promptName: LOCAL_FILE_SUMMARY_PROMPT_NAME,
        source: 'mcp',
        location: 'local',
        serverId: LOCAL_FILE_SUMMARY_SERVER_ID,
        input: formatPromptInvocationInput(filename, userGoal),
        execute: () => buildLocalSummaryPromptContextMessages(filename, userGoal),
    }
}
