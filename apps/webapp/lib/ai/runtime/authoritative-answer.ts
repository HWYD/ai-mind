import type { ToolCall } from '@langchain/core/messages'

import type { ChatToolDefinition } from '@/lib/ai/tools'
import type { ChatRequest } from '@/lib/ai/types/chat'

import type { ExecutedToolResult } from './types'

const OPEN_ENDED_INTENT_PATTERNS = [
    /\u5982\u4f55/,
    /\u4e3a\u4ec0\u4e48/,
    /\u600e\u4e48\u5b66/,
    /\u600e\u4e48\u505a/,
    /\u5efa\u8bae/,
    /\u89e3\u91ca/,
    /\u539f\u7406/,
    /\u6bd4\u8f83/,
    /\u603b\u7ed3/,
    /\u4f18\u7f3a\u70b9/,
    /\u9002\u5408/,
    /\u6848\u4f8b/,
]
const DETERMINISTIC_EXPRESSION_PATTERN = /[0-9]+\s*[+\-*/\u00d7xX]/
const DETERMINISTIC_UTILITY_PATTERN = /\u7b49\u4e8e\u591a\u5c11|\u8ba1\u7b97|\u6c42\u503c|\u5355\u4f4d\u6362\u7b97|\u6362\u7b97\u6210/
const QUESTION_SEPARATOR_PATTERN = /[\uFF1F\u3002?!\uFF01\uFF1B;]/
const DIRECT_ANSWER_REASON = 'single-authoritative-tool'

function formatDirectAnswer(input: string, output: string) {
    return `\`${input}\` \u7684\u7ed3\u679c\u662f **${output}**\u3002`
}

function normalizeText(text: string) {
    return text.trim().replace(/\s+/g, ' ')
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

function hasOpenEndedIntent(text: string) {
    return OPEN_ENDED_INTENT_PATTERNS.some(pattern => pattern.test(text))
}

function hasDeterministicIntent(text: string) {
    return DETERMINISTIC_EXPRESSION_PATTERN.test(text) || DETERMINISTIC_UTILITY_PATTERN.test(text)
}

function hasMixedQuestionStructure(text: string) {
    const questionSegments = normalizeText(text)
        .split(QUESTION_SEPARATOR_PATTERN)
        .map(segment => segment.trim())
        .filter(Boolean)

    if (questionSegments.length <= 1) {
        return false
    }

    const hasDeterministicSegment = questionSegments.some(segment => hasDeterministicIntent(segment))
    const hasOpenEndedSegment = questionSegments.some(segment => hasOpenEndedIntent(segment))

    return hasDeterministicSegment && hasOpenEndedSegment
}

function isSingleDeterministicUtilityIntent(text: string) {
    return hasDeterministicIntent(normalizeText(text))
}

function getFinalUserText(request: ChatRequest) {
    return normalizeText(getLastUserMessageText(request))
}

function createSingleToolNonBypassDecision(toolName: string): AuthoritativeAnswerDecision {
    return {
        shouldBypassModel: false,
        toolNames: [toolName],
    }
}

function createMultiToolNonBypassDecision(executedToolResults: ExecutedToolResult[]): AuthoritativeAnswerDecision {
    return {
        shouldBypassModel: false,
        toolNames: executedToolResults.map(result => result.toolCall.name),
    }
}

export interface AuthoritativeBypassContext {
    request: ChatRequest
    toolDefinitionMap: ReadonlyMap<string, ChatToolDefinition>
    executedToolResults: ExecutedToolResult[]
}

export interface AuthoritativeAnswerDecision {
    shouldBypassModel: boolean
    answerText?: string
    reason?: 'single-authoritative-tool'
    toolNames: string[]
}

export function shouldBypassAuthoritativeAnswer({ request, toolDefinitionMap, executedToolResults }: AuthoritativeBypassContext) {
    if (executedToolResults.length !== 1) {
        return false
    }

    const [executedToolResult] = executedToolResults
    const toolDefinition = toolDefinitionMap.get(executedToolResult.toolCall.name)

    if (!toolDefinition?.resultIsAuthoritative || !executedToolResult.success || !executedToolResult.output) {
        return false
    }

    const userText = getFinalUserText(request)

    if (!userText) {
        return false
    }

    if (hasOpenEndedIntent(userText) || hasMixedQuestionStructure(userText)) {
        return false
    }

    if (!isSingleDeterministicUtilityIntent(userText)) {
        return false
    }

    return true
}

export function decideAuthoritativeToolAnswer(
    executedToolResults: ExecutedToolResult[],
    toolDefinitionMap: ReadonlyMap<string, ChatToolDefinition>,
    formatToolInput: (toolCall: ToolCall) => string
): AuthoritativeAnswerDecision {
    if (executedToolResults.length !== 1) {
        return createMultiToolNonBypassDecision(executedToolResults)
    }

    const [executedToolResult] = executedToolResults
    const toolDefinition = toolDefinitionMap.get(executedToolResult.toolCall.name)

    if (!toolDefinition?.resultIsAuthoritative || !executedToolResult.success || !executedToolResult.output) {
        return createSingleToolNonBypassDecision(executedToolResult.toolCall.name)
    }

    return {
        shouldBypassModel: true,
        answerText: formatDirectAnswer(formatToolInput(executedToolResult.toolCall), executedToolResult.output),
        reason: DIRECT_ANSWER_REASON,
        toolNames: [executedToolResult.toolCall.name],
    }
}

export function createAuthoritativeToolAnswer(
    executedToolResults: ExecutedToolResult[],
    toolDefinitionMap: ReadonlyMap<string, ChatToolDefinition>,
    formatToolInput: (toolCall: ToolCall) => string
): string | null {
    const decision = decideAuthoritativeToolAnswer(executedToolResults, toolDefinitionMap, formatToolInput)

    return decision.shouldBypassModel ? (decision.answerText ?? null) : null
}
