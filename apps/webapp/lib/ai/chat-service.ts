import { AIMessage, AIMessageChunk, type BaseMessage, SystemMessage, type ToolCall, ToolMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'
import { ZodError } from 'zod'

import { createId } from './create-id'
import { toLangChainMessages } from './langchain-message-adapter'
import { getToolResultSystemPrompt, getToolRetrySystemPrompt, getToolUseSystemPrompt } from './prompts/tool-calling'
import type { SkillDefinition } from './skills'
import { resolveSkillDefinitionForRequest } from './skills/router'
import { createAuthoritativeToolAnswer, type ExecutedToolResult } from './strategies/tool-answer'
import { type ChatToolDefinition, chatToolRegistry } from './tools'
import { MAX_PROJECT_RESOURCE_PREVIEW_CHARS } from './tools/local-text-read-shared'
import type { ChatRequest } from './types/chat'
import type { ChatStreamChunk } from './types/stream-chunk'

function getContentText(content: unknown): string {
    if (typeof content === 'string') {
        return content
    }

    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .map(part => {
            if (typeof part === 'string') {
                return part
            }

            if (typeof part === 'object' && part && 'text' in part) {
                return String(part.text)
            }

            return ''
        })
        .join('')
}

function getChunkText(chunk: AIMessageChunk): string {
    return getContentText(chunk.content)
}

function getMessageText(message: AIMessage | ToolMessage): string {
    return getContentText(message.content)
}

function getReasoningText(source: { additional_kwargs?: Record<string, unknown> }): string {
    const reasoningContent = source.additional_kwargs?.reasoning_content

    if (typeof reasoningContent === 'string') {
        return reasoningContent
    }

    return ''
}

function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

function isControllerClosedError(error: unknown): boolean {
    return error instanceof TypeError && error.message.includes('Controller is already closed')
}

function toNdjsonLine(chunk: ChatStreamChunk): string {
    return `${JSON.stringify(chunk)}\n`
}

function logChatCancellation(reason: string) {
    // eslint-disable-next-line no-console
    console.info(`[chat] stream cancelled: ${reason}`)
}

function logSkillRuntime(event: string, payload: Record<string, unknown>) {
    if (process.env.NODE_ENV === 'production') {
        return
    }

    // eslint-disable-next-line no-console
    console.info(`[skill-runtime] ${event}`, payload)
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
    }
}

function writeStaticTextPart(writeChunk: (chunk: ChatStreamChunk) => void, text: string) {
    if (!text) {
        return
    }

    const partId = createId()

    writeChunk({
        type: 'text-start',
        partId,
    })
    writeChunk({
        type: 'text-delta',
        partId,
        delta: text,
    })
    writeChunk({
        type: 'text-end',
        partId,
    })
}

function writeStaticReasoningPart(writeChunk: (chunk: ChatStreamChunk) => void, reasoning: string) {
    if (!reasoning) {
        return
    }

    const partId = createId()

    writeChunk({
        type: 'reasoning-start',
        partId,
    })
    writeChunk({
        type: 'reasoning-delta',
        partId,
        delta: reasoning,
    })
    writeChunk({
        type: 'reasoning-end',
        partId,
    })
}

function buildSystemMessages(...prompts: Array<string | undefined>): BaseMessage[] {
    return prompts
        .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
        .map(prompt => new SystemMessage(prompt))
}

function getSkillOutputPolicyPrompt(skillDefinition?: SkillDefinition) {
    if (!skillDefinition?.outputPolicy) {
        return undefined
    }

    switch (skillDefinition.outputPolicy) {
        case 'concise-utility':
            return '请优先输出简洁、结果优先、偏实用的回答；能先给结论就先给结论，不要展开冗长过程。'
        case 'context-reader':
            return '请优先基于外部上下文先给结论，再用一到两句话补充必要来源或依据；不要展开冗长叙述，也不要假装读取了工具未返回的信息。'
    }
}

function getActiveToolDefinitions(skillDefinition?: SkillDefinition): ChatToolDefinition[] {
    if (!skillDefinition) {
        return []
    }

    const allowedToolNames = new Set(skillDefinition.allowedTools)

    return chatToolRegistry.listActive().filter(toolDefinition => allowedToolNames.has(toolDefinition.name))
}

async function streamAssistantParts(
    modelStream: AsyncIterable<AIMessageChunk>,
    context: ChatExecutionContext,
    writeChunk: (chunk: ChatStreamChunk) => void,
    isClosed: () => boolean
) {
    let textStarted = false
    let reasoningStarted = false
    const textPartId = createId()
    const reasoningPartId = createId()

    const ensureTextPartStarted = () => {
        if (textStarted) {
            return
        }

        textStarted = true
        writeChunk({
            type: 'text-start',
            partId: textPartId,
        })
    }

    const ensureReasoningPartStarted = () => {
        if (reasoningStarted) {
            return
        }

        reasoningStarted = true
        writeChunk({
            type: 'reasoning-start',
            partId: reasoningPartId,
        })
    }

    for await (const chunk of modelStream) {
        if (context.signal?.aborted || isClosed()) {
            if (context.signal?.aborted) {
                logChatCancellation('request aborted by client')
            }
            return
        }

        const reasoning = getReasoningText(chunk)
        const text = getChunkText(chunk)

        if (reasoning) {
            ensureReasoningPartStarted()
            writeChunk({
                type: 'reasoning-delta',
                partId: reasoningPartId,
                delta: reasoning,
            })
        }

        if (text) {
            ensureTextPartStarted()
            writeChunk({
                type: 'text-delta',
                partId: textPartId,
                delta: text,
            })
        }
    }

    if (reasoningStarted) {
        writeChunk({
            type: 'reasoning-end',
            partId: reasoningPartId,
        })
    }

    if (textStarted) {
        writeChunk({
            type: 'text-end',
            partId: textPartId,
        })
    }
}

function toAIMessage(chunk: AIMessageChunk | null): AIMessage {
    if (!chunk) {
        return new AIMessage({
            content: '',
            tool_calls: [],
            invalid_tool_calls: [],
        })
    }

    return new AIMessage({
        id: chunk.id,
        content: chunk.content,
        additional_kwargs: chunk.additional_kwargs,
        response_metadata: chunk.response_metadata,
        usage_metadata: chunk.usage_metadata,
        tool_calls: chunk.tool_calls,
        invalid_tool_calls: chunk.invalid_tool_calls,
    })
}

// 第一阶段是真正的流式规划：一边接收模型的 reasoning / text，一边累计完整 AIMessage。
// 如果流中出现 tool call，正文将停止继续透传，但 reasoning 仍保留用于调试。
async function streamPlanningResponse(
    modelStream: AsyncIterable<AIMessageChunk>,
    context: ChatExecutionContext,
    writeChunk: (chunk: ChatStreamChunk) => void,
    isClosed: () => boolean
) {
    let combinedChunk: AIMessageChunk | null = null
    let textStarted = false
    let reasoningStarted = false
    let encounteredToolCall = false
    const textPartId = createId()
    const reasoningPartId = createId()

    const ensureTextPartStarted = () => {
        if (textStarted) {
            return
        }

        textStarted = true
        writeChunk({
            type: 'text-start',
            partId: textPartId,
        })
    }

    const ensureReasoningPartStarted = () => {
        if (reasoningStarted) {
            return
        }

        reasoningStarted = true
        writeChunk({
            type: 'reasoning-start',
            partId: reasoningPartId,
        })
    }

    for await (const chunk of modelStream) {
        if (context.signal?.aborted || isClosed()) {
            if (context.signal?.aborted) {
                logChatCancellation('request aborted by client')
            }
            return toAIMessage(combinedChunk)
        }

        combinedChunk = combinedChunk ? combinedChunk.concat(chunk) : chunk

        const reasoning = getReasoningText(chunk)

        if (reasoning) {
            ensureReasoningPartStarted()
            writeChunk({
                type: 'reasoning-delta',
                partId: reasoningPartId,
                delta: reasoning,
            })
        }

        if (chunk.tool_call_chunks?.length || chunk.tool_calls?.length) {
            encounteredToolCall = true
        }

        const text = getChunkText(chunk)

        if (!encounteredToolCall && text) {
            ensureTextPartStarted()
            writeChunk({
                type: 'text-delta',
                partId: textPartId,
                delta: text,
            })
        }
    }

    if (reasoningStarted) {
        writeChunk({
            type: 'reasoning-end',
            partId: reasoningPartId,
        })
    }

    if (textStarted) {
        writeChunk({
            type: 'text-end',
            partId: textPartId,
        })
    }

    return toAIMessage(combinedChunk)
}

function stripMessageText(message: AIMessage) {
    return new AIMessage({
        id: message.id,
        content: '',
        additional_kwargs: message.additional_kwargs,
        response_metadata: message.response_metadata,
        usage_metadata: message.usage_metadata,
        tool_calls: message.tool_calls,
        invalid_tool_calls: message.invalid_tool_calls,
    })
}

/**
 * 对模型产出的 tool calls 做统一的参数归一化、schema 校验和展示字段补齐。
 * 返回结果分成两路：
 * - validatedToolCalls：可以真正进入执行阶段的调用
 * - toolErrors：需要直接下发给前端的结构化错误
 */
function normalizeAndValidateToolCalls(message: AIMessage) {
    const validatedToolCalls: ToolCall[] = []
    const toolErrors: Array<{
        id: string
        toolName: string
        title?: string
        action?: string
        input: string
        message: string
        outputPartType: 'resource' | 'tool'
        resourceName?: string
        serverId?: string
        source: 'internal' | 'mcp'
        uri?: string
    }> = []

    for (const rawToolCall of message.tool_calls ?? []) {
        const toolCall = {
            ...rawToolCall,
            id: rawToolCall.id ?? createId(),
        }

        const toolDefinition = chatToolRegistry.get(toolCall.name)
        const displayFields = getToolDisplayFields(toolCall)
        const resourceDisplayFields = displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall) : undefined

        if (!toolDefinition) {
            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                input: formatToolInput(toolCall),
                message: '工具 ' + toolCall.name + ' 未注册。',
                outputPartType: displayFields.outputPartType,
                resourceName: resourceDisplayFields?.resourceName,
                serverId: displayFields.serverId,
                source: displayFields.source,
                uri: resourceDisplayFields?.uri,
            })
            continue
        }

        const normalizedArgs = toolDefinition.normalizeArgs ? toolDefinition.normalizeArgs(toolCall.args) : toolCall.args
        const parsedArgs = toolDefinition.schema.safeParse(normalizedArgs)

        if (!parsedArgs.success) {
            const normalizedToolCall = {
                ...toolCall,
                args: normalizedArgs,
            }
            const normalizedDisplayFields = getToolDisplayFields(normalizedToolCall)
            const normalizedResourceDisplayFields =
                normalizedDisplayFields.outputPartType === 'resource' ? getResourceDisplayFields(normalizedToolCall) : undefined

            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: normalizedDisplayFields.title,
                action: normalizedDisplayFields.action,
                input: formatToolInput(normalizedToolCall),
                message: createToolValidationErrorMessage(toolCall, parsedArgs.error),
                outputPartType: normalizedDisplayFields.outputPartType,
                resourceName: normalizedResourceDisplayFields?.resourceName,
                serverId: normalizedDisplayFields.serverId,
                source: normalizedDisplayFields.source,
                uri: normalizedResourceDisplayFields?.uri,
            })
            continue
        }

        validatedToolCalls.push({
            ...toolCall,
            args: parsedArgs.data,
        })
    }

    if (validatedToolCalls.length === 0) {
        return {
            planningMessage: message,
            toolCalls: validatedToolCalls,
            toolErrors,
        }
    }

    return {
        planningMessage: new AIMessage({
            id: message.id,
            content: '',
            additional_kwargs: message.additional_kwargs,
            response_metadata: message.response_metadata,
            usage_metadata: message.usage_metadata,
            tool_calls: validatedToolCalls,
            invalid_tool_calls: message.invalid_tool_calls,
        }),
        toolCalls: validatedToolCalls,
        toolErrors,
    }
}
async function executeToolCall(
    toolCall: ToolCall,
    context: ChatExecutionContext,
    writeChunk: (chunk: ChatStreamChunk) => void
): Promise<ExecutedToolResult> {
    throwIfAborted(context.signal)

    const toolDefinition = chatToolRegistry.get(toolCall.name)
    const partId = createId()
    const input = formatToolInput(toolCall)
    const displayFields = getToolDisplayFields(toolCall)
    const resourceDisplayFields = displayFields.outputPartType === 'resource' ? getResourceDisplayFields(toolCall) : undefined
    const resourceServerId = displayFields.serverId ?? 'mcp-resource'

    if (displayFields.outputPartType === 'resource' && resourceDisplayFields) {
        writeChunk({
            type: 'resource-start',
            partId,
            resourceName: resourceDisplayFields.resourceName,
            uri: resourceDisplayFields.uri,
            serverId: resourceServerId,
        })
    } else {
        writeChunk({
            type: 'tool-start',
            partId,
            toolName: toolCall.name,
            title: displayFields.title,
            action: displayFields.action,
            source: displayFields.source,
            serverId: displayFields.serverId,
            input,
        })
    }
    if (!toolDefinition) {
        const message = '工具 ' + toolCall.name + ' 未注册。'
        if (displayFields.outputPartType === 'resource' && resourceDisplayFields) {
            writeChunk({
                type: 'resource-error',
                partId,
                resourceName: resourceDisplayFields.resourceName,
                uri: resourceDisplayFields.uri,
                serverId: resourceServerId,
                message,
            })
        } else {
            writeChunk({
                type: 'tool-error',
                partId,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                source: displayFields.source,
                serverId: displayFields.serverId,
                input,
                message,
            })
        }

        const toolMessage = new ToolMessage({
            content: message,
            tool_call_id: toolCall.id ?? createId(),
            status: 'error',
            metadata: {
                toolName: toolCall.name,
            },
        })

        return {
            toolCall,
            toolMessage,
            output: message,
            success: false,
        }
    }

    try {
        const result = await toolDefinition.tool.invoke(
            {
                type: 'tool_call',
                id: toolCall.id,
                name: toolCall.name,
                args: toolCall.args,
            },
            {
                signal: context.signal,
            }
        )

        const output = formatToolExecutionOutput(toolDefinition, result)
        const toolMessage = ToolMessage.isInstance(result)
            ? result
            : new ToolMessage({
                  content: output,
                  tool_call_id: toolCall.id ?? createId(),
                  status: 'success',
                  metadata: {
                      toolName: toolCall.name,
                  },
              })

        if (displayFields.outputPartType === 'resource') {
            const resourceResultFields = getResourceResultFields(toolCall, result, output)

            writeChunk({
                type: 'resource-end',
                partId,
                resourceName: resourceResultFields.resourceName,
                uri: resourceResultFields.uri,
                serverId: resourceServerId,
                contentPreview: resourceResultFields.contentPreview,
                isTruncated: resourceResultFields.isTruncated,
                previewChars: resourceResultFields.previewChars,
            })
        } else {
            writeChunk({
                type: 'tool-end',
                partId,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                source: displayFields.source,
                serverId: displayFields.serverId,
                input,
                output,
            })
        }

        return {
            toolCall,
            toolMessage,
            output,
            success: true,
        }
    } catch (error) {
        if (isAbortError(error) || context.signal?.aborted) {
            throw error
        }

        const message = error instanceof Error ? error.message : '工具执行失败。'

        if (displayFields.outputPartType === 'resource' && resourceDisplayFields) {
            writeChunk({
                type: 'resource-error',
                partId,
                resourceName: resourceDisplayFields.resourceName,
                uri: resourceDisplayFields.uri,
                serverId: resourceServerId,
                message,
            })
        } else {
            writeChunk({
                type: 'tool-error',
                partId,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                source: displayFields.source,
                serverId: displayFields.serverId,
                input,
                message,
            })
        }

        const toolMessage = new ToolMessage({
            content: message,
            tool_call_id: toolCall.id ?? createId(),
            status: 'error',
            metadata: {
                toolName: toolCall.name,
            },
        })

        return {
            toolCall,
            toolMessage,
            output: message,
            success: false,
        }
    }
}

function writeToolValidationErrors(
    toolErrors: Array<{
        id: string
        toolName: string
        title?: string
        action?: string
        input: string
        message: string
        outputPartType: 'resource' | 'tool'
        resourceName?: string
        serverId?: string
        source: 'internal' | 'mcp'
        uri?: string
    }>,
    writeChunk: (chunk: ChatStreamChunk) => void
) {
    return toolErrors.map(toolError => {
        const partId = createId()

        if (toolError.outputPartType === 'resource') {
            writeChunk({
                type: 'resource-start',
                partId,
                resourceName: toolError.resourceName ?? toolError.toolName,
                uri: toolError.uri ?? 'resource://unknown',
                serverId: toolError.serverId ?? 'mcp-resource',
            })
            writeChunk({
                type: 'resource-error',
                partId,
                resourceName: toolError.resourceName ?? toolError.toolName,
                uri: toolError.uri ?? 'resource://unknown',
                serverId: toolError.serverId ?? 'mcp-resource',
                message: toolError.message,
            })
        } else {
            writeChunk({
                type: 'tool-start',
                partId,
                toolName: toolError.toolName,
                title: toolError.title,
                action: toolError.action,
                source: toolError.source,
                serverId: toolError.serverId,
                input: toolError.input,
            })
            writeChunk({
                type: 'tool-error',
                partId,
                toolName: toolError.toolName,
                title: toolError.title,
                action: toolError.action,
                source: toolError.source,
                serverId: toolError.serverId,
                input: toolError.input,
                message: toolError.message,
            })
        }

        return new ToolMessage({
            content: toolError.message,
            tool_call_id: toolError.id,
            status: 'error',
            metadata: {
                toolName: toolError.toolName,
            },
        })
    })
}
function createBaseModel(request: ChatRequest, deps: ChatServiceDependencies) {
    return new ChatOllama({
        model: request.options?.model ?? deps.defaultModel,
        baseUrl: deps.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
        temperature: request.options?.temperature ?? 0.3,
        numPredict: request.options?.maxTokens,
        think: request.options?.enableReasoning,
        streaming: true,
    })
}

async function streamDirectAnswer(
    model: ChatOllama,
    langChainMessages: BaseMessage[],
    context: ChatExecutionContext,
    writeChunk: (chunk: ChatStreamChunk) => void,
    isClosed: () => boolean
) {
    const stream = await model.stream(langChainMessages, {
        signal: context.signal,
    })

    await streamAssistantParts(stream, context, writeChunk, isClosed)
}

function hasVisibleAssistantText(message: AIMessage) {
    return getMessageText(message).trim().length > 0
}

export interface ChatExecutionContext {
    signal?: AbortSignal
}

export interface ChatServiceDependencies {
    defaultModel: string
    baseUrl?: string
}

export function createChatService(deps: ChatServiceDependencies) {
    return {
        // 聊天主链负责：解析 Skill、绑定可用 Tool、完成 planning / execution / final answer 三段式流式输出。
        async streamChat(request: ChatRequest, context: ChatExecutionContext) {
            const baseModel = createBaseModel(request, deps)
            const skillDefinition = resolveSkillDefinitionForRequest(request)
            const skillSystemPrompt = skillDefinition?.systemPrompt
            const skillOutputPolicyPrompt = getSkillOutputPolicyPrompt(skillDefinition)
            const activeTools = getActiveToolDefinitions(skillDefinition)
            const activeToolNames = activeTools.map(toolDefinition => toolDefinition.name)
            const toolUseSystemPrompt = getToolUseSystemPrompt(activeToolNames)
            const toolRetrySystemPrompt = getToolRetrySystemPrompt(activeToolNames)
            const toolResultSystemPrompt = getToolResultSystemPrompt(activeToolNames)
            const toolBoundModel =
                activeTools.length > 0 ? baseModel.bindTools(activeTools.map(toolDefinition => toolDefinition.tool)) : null
            const langChainMessages = toLangChainMessages(request.messages)
            const directAnswerMessages: BaseMessage[] = [
                ...buildSystemMessages(skillSystemPrompt, skillOutputPolicyPrompt),
                ...langChainMessages,
            ]
            const encoder = new TextEncoder()
            const messageId = createId()

            let closed = false

            const responseStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    const closeStream = () => {
                        if (closed) {
                            return
                        }

                        closed = true

                        try {
                            controller.close()
                        } catch (error) {
                            if (!isControllerClosedError(error)) {
                                throw error
                            }
                        }
                    }

                    const writeChunk = (chunk: ChatStreamChunk) => {
                        if (closed) {
                            return
                        }

                        try {
                            controller.enqueue(encoder.encode(toNdjsonLine(chunk)))
                        } catch (error) {
                            if (isControllerClosedError(error)) {
                                closed = true
                                return
                            }

                            throw error
                        }
                    }

                    const run = async () => {
                        try {
                            throwIfAborted(context.signal)

                            logSkillRuntime('request-start', {
                                requestedSkill: request.options?.skill ?? null,
                                resolvedSkill: skillDefinition?.name ?? null,
                                activeTools: activeToolNames,
                            })

                            writeChunk({
                                type: 'start',
                                messageId,
                            })

                            if (!toolBoundModel) {
                                await streamDirectAnswer(baseModel, directAnswerMessages, context, writeChunk, () => closed)

                                if (!context.signal?.aborted && !closed) {
                                    writeChunk({
                                        type: 'finish',
                                    })
                                }
                                return
                            }

                            const planningMessages: BaseMessage[] = [
                                ...buildSystemMessages(skillSystemPrompt, skillOutputPolicyPrompt, toolUseSystemPrompt),
                                ...langChainMessages,
                            ]
                            const planningStream = await toolBoundModel.stream(planningMessages, {
                                signal: context.signal,
                            })
                            const firstResponse = await streamPlanningResponse(planningStream, context, writeChunk, () => closed)

                            let validationResult = normalizeAndValidateToolCalls(firstResponse)
                            let planningMessage = validationResult.planningMessage
                            let toolCalls = validationResult.toolCalls

                            logSkillRuntime('planning-finished', {
                                skill: skillDefinition?.name ?? null,
                                toolCalls: toolCalls.map(toolCall => toolCall.name),
                                hasVisibleText: hasVisibleAssistantText(firstResponse),
                                validationErrors: validationResult.toolErrors.length,
                            })

                            if (toolCalls.length === 0 && !hasVisibleAssistantText(firstResponse)) {
                                const retryMessages: BaseMessage[] = [
                                    ...buildSystemMessages(
                                        skillSystemPrompt,
                                        skillOutputPolicyPrompt,
                                        toolUseSystemPrompt,
                                        toolRetrySystemPrompt
                                    ),
                                    ...langChainMessages,
                                ]
                                const retryPlanningStream = await toolBoundModel.stream(retryMessages, {
                                    signal: context.signal,
                                })
                                const retryResponse = await streamPlanningResponse(retryPlanningStream, context, writeChunk, () => closed)

                                validationResult = normalizeAndValidateToolCalls(retryResponse)
                                planningMessage = validationResult.planningMessage
                                toolCalls = validationResult.toolCalls

                                logSkillRuntime('retry-finished', {
                                    skill: skillDefinition?.name ?? null,
                                    toolCalls: toolCalls.map(toolCall => toolCall.name),
                                    hasVisibleText: hasVisibleAssistantText(retryResponse),
                                    validationErrors: validationResult.toolErrors.length,
                                })

                                if (toolCalls.length === 0 && !hasVisibleAssistantText(retryResponse)) {
                                    await streamDirectAnswer(baseModel, directAnswerMessages, context, writeChunk, () => closed)

                                    if (!context.signal?.aborted && !closed) {
                                        writeChunk({
                                            type: 'finish',
                                        })
                                    }
                                    return
                                }
                            }

                            if (toolCalls.length === 0) {
                                writeToolValidationErrors(validationResult.toolErrors, writeChunk)
                                writeChunk({
                                    type: 'finish',
                                })
                                return
                            }

                            const toolMessages: ToolMessage[] = [...writeToolValidationErrors(validationResult.toolErrors, writeChunk)]
                            const executedToolResults: ExecutedToolResult[] = []
                            const strippedPlanningMessage = stripMessageText(planningMessage)

                            for (const toolCall of toolCalls) {
                                const executedToolResult = await executeToolCall(toolCall, context, writeChunk)
                                executedToolResults.push(executedToolResult)
                                toolMessages.push(executedToolResult.toolMessage)
                            }

                            const authoritativeAnswer = createAuthoritativeToolAnswer(executedToolResults, formatToolInput)

                            if (authoritativeAnswer) {
                                logSkillRuntime('authoritative-answer', {
                                    skill: skillDefinition?.name ?? null,
                                    tools: executedToolResults.map(result => result.toolCall.name),
                                })
                                writeStaticTextPart(writeChunk, authoritativeAnswer)
                                writeChunk({
                                    type: 'finish',
                                })
                                return
                            }

                            throwIfAborted(context.signal)

                            const finalMessages: BaseMessage[] = [
                                ...buildSystemMessages(
                                    skillSystemPrompt,
                                    skillOutputPolicyPrompt,
                                    toolUseSystemPrompt,
                                    toolResultSystemPrompt
                                ),
                                ...langChainMessages,
                                strippedPlanningMessage,
                                ...toolMessages,
                            ]
                            const finalStream = await toolBoundModel.stream(finalMessages, {
                                signal: context.signal,
                            })

                            await streamAssistantParts(finalStream, context, writeChunk, () => closed)

                            if (context.signal?.aborted || closed) {
                                return
                            }

                            writeChunk({
                                type: 'finish',
                            })
                        } catch (streamError) {
                            if (isAbortError(streamError) || context.signal?.aborted || closed) {
                                if (context.signal?.aborted || isAbortError(streamError)) {
                                    logChatCancellation('model stream aborted')
                                }
                                return
                            }

                            writeChunk({
                                type: 'error',
                                message: 'Model streaming failed.',
                            })
                        } finally {
                            closeStream()
                        }
                    }

                    void run().catch(error => {
                        if (isAbortError(error) || context.signal?.aborted || closed) {
                            closeStream()
                            return
                        }

                        // eslint-disable-next-line no-console
                        console.error('Chat stream failed:', error)
                        closeStream()
                    })
                },
                cancel() {
                    logChatCancellation('response stream consumer cancelled')
                    closed = true
                },
            })

            return new Response(responseStream, {
                headers: {
                    'Content-Type': 'application/x-ndjson; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                },
            })
        },
    }
}

/**
 * 统一格式化模型传回的 tool args，优先复用 Tool 自己声明的 `formatInput`。
 */
function formatToolInput(toolCall: ToolCall) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        return toolDefinition?.formatInput ? toolDefinition.formatInput(toolCall.args) : JSON.stringify(toolCall.args)
    } catch {
        return JSON.stringify(toolCall.args)
    }
}

/**
 * 从 Tool Definition 中提取展示层元信息。
 * 这里做容错是为了避免单个 Tool 的展示配置异常打断整条主链。
 */
function getToolDisplayFields(toolCall: ToolCall) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        const displayConfig = toolDefinition?.getDisplayConfig?.(toolCall.args)

        return {
            title: displayConfig?.title,
            action: displayConfig?.action,
            outputPartType: toolDefinition?.outputPartType ?? 'tool',
            source: toolDefinition?.source ?? 'internal',
            serverId: toolDefinition?.serverId,
        } as const
    } catch {
        return {
            title: toolCall.name,
            action:
                typeof toolCall.args === 'object' && toolCall.args && 'action' in toolCall.args
                    ? String((toolCall.args as { action?: unknown }).action)
                    : undefined,
            outputPartType: toolDefinition?.outputPartType ?? 'tool',
            source: toolDefinition?.source ?? 'internal',
            serverId: toolDefinition?.serverId,
        } as const
    }
}

/**
 * 为 Resource 类能力生成基础展示字段。
 * 如果 Tool 没有提供专门的 Resource 展示配置，这里会给出兜底值。
 */
function getResourceDisplayFields(toolCall: ToolCall) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    try {
        const resourceDisplayConfig = toolDefinition?.getResourceDisplayConfig?.(toolCall.args)
        const toolDisplayConfig = toolDefinition?.getDisplayConfig?.(toolCall.args)

        return {
            resourceName: resourceDisplayConfig?.resourceName ?? toolDisplayConfig?.title ?? toolCall.name,
            uri: resourceDisplayConfig?.uri ?? 'resource://unknown',
        }
    } catch {
        return {
            resourceName: toolCall.name,
            uri: 'resource://unknown',
        }
    }
}

/**
 * 把 Tool 的实际执行结果压成前端 Resource card 需要的字段。
 * 如果 Tool 没有提供结构化 Resource 结果，就退化成基于输出文本的预览。
 */
function getResourceResultFields(toolCall: ToolCall, result: unknown, output: string) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    if (toolDefinition?.getResourceResult) {
        const resourceResult = toolDefinition.getResourceResult(toolCall.args, result)

        if (resourceResult) {
            return resourceResult
        }
    }

    const displayFields = getResourceDisplayFields(toolCall)

    return {
        resourceName: displayFields.resourceName,
        uri: displayFields.uri,
        contentPreview: output.slice(0, MAX_PROJECT_RESOURCE_PREVIEW_CHARS),
        isTruncated: output.length > MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
        previewChars: MAX_PROJECT_RESOURCE_PREVIEW_CHARS,
    }
}

/**
 * 统一把 Tool 的执行结果转成字符串。
 * 对有自定义 `formatOutput` 的 Tool，优先使用 Tool 自己的结果格式化逻辑。
 */
function formatToolExecutionOutput(toolDefinition: ChatToolDefinition, result: unknown) {
    if (toolDefinition.formatOutput) {
        return toolDefinition.formatOutput(result)
    }

    if (typeof result === 'string') {
        return result
    }

    if (ToolMessage.isInstance(result)) {
        return getMessageText(result)
    }

    return JSON.stringify(result)
}

/**
 * 把 schema 校验错误整理成更适合日志与前端展示的可读文案。
 */
function createToolValidationErrorMessage(toolCall: ToolCall, error: ZodError | string) {
    if (typeof error === 'string') {
        return error
    }

    const issueMessage = error.issues.map(issue => issue.message).join('；')

    return `模型生成的 ${toolCall.name} 工具参数不合法：${issueMessage || '请检查 tool call 参数。'}`
}
