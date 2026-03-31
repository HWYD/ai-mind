import { AIMessage, AIMessageChunk, type BaseMessage, SystemMessage, type ToolCall, ToolMessage } from '@langchain/core/messages'
import { ChatOllama } from '@langchain/ollama'
import { ZodError } from 'zod'

import { createId } from './create-id'
import { toLangChainMessages } from './langchain-message-adapter'
import { toolResultSystemPrompt, toolRetrySystemPrompt, toolUseSystemPrompt } from './prompts/tool-calling'
import { getChatSkillDefinition, type SkillDefinition } from './skills'
import { createAuthoritativeToolAnswer, type ExecutedToolResult } from './strategies/tool-answer'
import { type ChatToolDefinition, chatToolRegistry } from './tools'
import type { ChatRequest } from './types/chat'
import type { ChatStreamChunk } from './types/stream-chunk'

const INVALID_SKILL_ERROR_NAME = 'InvalidSkillError'

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

function createInvalidSkillError(skillName: string) {
    const error = new Error(`Skill ${skillName} 未注册或当前不可用。`)

    error.name = INVALID_SKILL_ERROR_NAME

    return error
}

function resolveRequestedSkill(request: ChatRequest): SkillDefinition | undefined {
    const skillName = request.options?.skill?.trim()

    if (!skillName) {
        return undefined
    }

    const skillDefinition = getChatSkillDefinition(skillName)

    if (!skillDefinition || !(skillDefinition.isAvailable?.() ?? true)) {
        throw createInvalidSkillError(skillName)
    }

    return skillDefinition
}

function getActiveToolDefinitions(skillDefinition?: SkillDefinition): ChatToolDefinition[] {
    const activeToolDefinitions = chatToolRegistry.listActive()

    if (!skillDefinition) {
        return activeToolDefinitions
    }

    const allowedToolNames = new Set(skillDefinition.allowedTools)

    return activeToolDefinitions.filter(toolDefinition => allowedToolNames.has(toolDefinition.name))
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

// 第一阶段是真正的流式消费：普通问答可以自然流出；如果后续出现 tool call，则停止继续透传正文。
async function streamPlanningResponse(
    modelStream: AsyncIterable<AIMessageChunk>,
    context: ChatExecutionContext,
    writeChunk: (chunk: ChatStreamChunk) => void,
    isClosed: () => boolean,
    options?: {
        suppressText?: boolean
    }
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

        if (!encounteredToolCall && text && !options?.suppressText) {
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

function formatToolInput(toolCall: ToolCall): string {
    const toolDefinition = chatToolRegistry.get(toolCall.name)

    if (!toolDefinition?.formatInput) {
        return JSON.stringify(toolCall.args ?? {}, null, 2)
    }

    return toolDefinition.formatInput(toolCall.args)
}

function getToolDisplayFields(toolCall: ToolCall) {
    const toolDefinition = chatToolRegistry.get(toolCall.name)
    let displayConfig: ReturnType<NonNullable<typeof toolDefinition.getDisplayConfig>> | undefined

    try {
        displayConfig = toolDefinition?.getDisplayConfig?.(toolCall.args)
    } catch {
        displayConfig = undefined
    }

    return {
        title: displayConfig?.title ?? toolCall.name,
        action:
            displayConfig?.action ??
            (toolCall.args && typeof toolCall.args === 'object' && 'action' in toolCall.args && typeof toolCall.args.action === 'string'
                ? toolCall.args.action
                : undefined),
    }
}

function createToolValidationErrorMessage(toolCall: ToolCall, error: ZodError | string) {
    if (typeof error === 'string') {
        return error
    }

    const issueMessage = error.issues.map(issue => issue.message).join('；')

    return `模型生成的 ${toolCall.name} 工具参数不合法：${issueMessage || '请检查 tool call 参数。'}`
}

function normalizeAndValidateToolCalls(message: AIMessage) {
    const validatedToolCalls: ToolCall[] = []
    const toolErrors: Array<{
        id: string
        toolName: string
        title?: string
        action?: string
        input: string
        message: string
    }> = []

    for (const rawToolCall of message.tool_calls ?? []) {
        const toolCall = {
            ...rawToolCall,
            id: rawToolCall.id ?? createId(),
        }

        const toolDefinition = chatToolRegistry.get(toolCall.name)

        if (!toolDefinition) {
            const displayFields = getToolDisplayFields(toolCall)

            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                input: formatToolInput(toolCall),
                message: '工具 ' + toolCall.name + ' 未注册。',
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
            const displayFields = getToolDisplayFields(normalizedToolCall)

            toolErrors.push({
                id: toolCall.id,
                toolName: toolCall.name,
                title: displayFields.title,
                action: displayFields.action,
                input: formatToolInput(normalizedToolCall),
                message: createToolValidationErrorMessage(toolCall, parsedArgs.error),
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

    writeChunk({
        type: 'tool-start',
        partId,
        toolName: toolCall.name,
        title: displayFields.title,
        action: displayFields.action,
        input,
    })

    if (!toolDefinition) {
        const message = '工具 ' + toolCall.name + ' 未注册。'

        writeChunk({
            type: 'tool-error',
            partId,
            toolName: toolCall.name,
            title: displayFields.title,
            action: displayFields.action,
            input,
            message,
        })

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

        const toolMessage = ToolMessage.isInstance(result)
            ? result
            : new ToolMessage({
                  content: typeof result === 'string' ? result : JSON.stringify(result),
                  tool_call_id: toolCall.id ?? createId(),
                  status: 'success',
                  metadata: {
                      toolName: toolCall.name,
                  },
              })

        const output = getMessageText(toolMessage)

        writeChunk({
            type: 'tool-end',
            partId,
            toolName: toolCall.name,
            title: displayFields.title,
            action: displayFields.action,
            input,
            output,
        })

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

        writeChunk({
            type: 'tool-error',
            partId,
            toolName: toolCall.name,
            title: displayFields.title,
            action: displayFields.action,
            input,
            message,
        })

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
    }>,
    writeChunk: (chunk: ChatStreamChunk) => void
) {
    return toolErrors.map(toolError => {
        const partId = createId()

        writeChunk({
            type: 'tool-start',
            partId,
            toolName: toolError.toolName,
            title: toolError.title,
            action: toolError.action,
            input: toolError.input,
        })
        writeChunk({
            type: 'tool-error',
            partId,
            toolName: toolError.toolName,
            title: toolError.title,
            action: toolError.action,
            input: toolError.input,
            message: toolError.message,
        })

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
        // 统一模型接入层：是否挂载工具由当前可用工具集合决定，不再按问题类型做人为分流。
        async streamChat(request: ChatRequest, context: ChatExecutionContext) {
            const baseModel = createBaseModel(request, deps)
            const skillDefinition = resolveRequestedSkill(request)
            const skillSystemPrompt = skillDefinition?.systemPrompt
            const activeTools = getActiveToolDefinitions(skillDefinition)
            const toolBoundModel =
                activeTools.length > 0 ? baseModel.bindTools(activeTools.map(toolDefinition => toolDefinition.tool)) : null
            const langChainMessages = toLangChainMessages(request.messages)
            const directAnswerMessages: BaseMessage[] = [...buildSystemMessages(skillSystemPrompt), ...langChainMessages]
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
                                ...buildSystemMessages(skillSystemPrompt, toolUseSystemPrompt),
                                ...langChainMessages,
                            ]
                            const planningStream = await toolBoundModel.stream(planningMessages, {
                                signal: context.signal,
                            })
                            const firstResponse = await streamPlanningResponse(planningStream, context, writeChunk, () => closed)

                            let validationResult = normalizeAndValidateToolCalls(firstResponse)
                            let planningMessage = validationResult.planningMessage
                            let toolCalls = validationResult.toolCalls

                            if (toolCalls.length === 0 && !hasVisibleAssistantText(firstResponse)) {
                                const retryMessages: BaseMessage[] = [
                                    ...buildSystemMessages(skillSystemPrompt, toolUseSystemPrompt, toolRetrySystemPrompt),
                                    ...langChainMessages,
                                ]
                                const retryPlanningStream = await toolBoundModel.stream(retryMessages, {
                                    signal: context.signal,
                                })
                                const retryResponse = await streamPlanningResponse(retryPlanningStream, context, writeChunk, () => closed)

                                validationResult = normalizeAndValidateToolCalls(retryResponse)
                                planningMessage = validationResult.planningMessage
                                toolCalls = validationResult.toolCalls

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
                                writeStaticTextPart(writeChunk, authoritativeAnswer)
                                writeChunk({
                                    type: 'finish',
                                })
                                return
                            }

                            throwIfAborted(context.signal)

                            const finalMessages: BaseMessage[] = [
                                ...buildSystemMessages(skillSystemPrompt, toolUseSystemPrompt, toolResultSystemPrompt),
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
