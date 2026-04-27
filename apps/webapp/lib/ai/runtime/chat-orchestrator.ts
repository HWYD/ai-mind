import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { AIMessage, BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import type { ChatRequest } from '@/lib/ai/types/chat'

import { hasVisibleAssistantText, streamAssistantParts, streamPlanningResponse, stripMessageText } from './assistant-stream'
import { decideAuthoritativeToolAnswer, shouldBypassAuthoritativeAnswer } from './authoritative-answer'
import { executeCapabilityContextInvocations, resolveCapabilityContextInvocations } from './capability-context'
import { buildSystemMessages, createChatSession } from './chat-session'
import { PromptRuntimeError, resolvePromptContextInvocation } from './prompt-context'
import { logSkillRuntime, throwIfAborted, writeStreamErrorChunk } from './stream-errors'
import { executeToolCall, formatToolInput, normalizeAndValidateToolCalls, writeToolValidationErrors } from './tool-runtime'
import type { ChatExecutionContext, ChatServiceDependencies, ExecutedToolResult, ToolValidationResult, WriteChunk } from './types'

interface ChatOrchestratorOptions {
    context: ChatExecutionContext
    deps: ChatServiceDependencies
    isClosed: () => boolean
    request: ChatRequest
    writeChunk: WriteChunk
}

interface PlanningAttemptResult {
    hasVisibleText: boolean
    validationResult: ToolValidationResult
}

interface PlanningToolingResult {
    kind: 'tooling'
    planningMessage: AIMessage
    toolCalls: ToolCall[]
    toolErrors: ToolValidationResult['toolErrors']
}

interface PlanningValidationOnlyResult {
    kind: 'validation-only'
    toolErrors: ToolValidationResult['toolErrors']
}

interface PlanningDirectFallbackResult {
    kind: 'direct-fallback'
}

type PlanningStageResult = PlanningToolingResult | PlanningValidationOnlyResult | PlanningDirectFallbackResult

interface ToolExecutionStageResult {
    executedToolResults: ExecutedToolResult[]
    toolMessages: ToolMessage[]
}

async function streamDirectAnswer(
    model: ReturnType<typeof createChatSession>['baseModel'],
    langChainMessages: BaseMessage[],
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    isClosed: () => boolean
) {
    const stream = await model.stream(langChainMessages, {
        signal: context.signal,
    })

    await streamAssistantParts(stream, context, writeChunk, isClosed)
}

export class ChatOrchestrator {
    private readonly context: ChatExecutionContext
    private readonly deps: ChatServiceDependencies
    private readonly isClosed: () => boolean
    private readonly request: ChatRequest
    private readonly writeChunk: WriteChunk

    constructor(options: ChatOrchestratorOptions) {
        this.context = options.context
        this.deps = options.deps
        this.isClosed = options.isClosed
        this.request = options.request
        this.writeChunk = options.writeChunk
    }

    private buildPlanningMessages(session: ReturnType<typeof createChatSession>, withRetryPrompt: boolean) {
        return [
            ...buildSystemMessages(
                session.skillSystemPrompt,
                session.skillOutputPolicyPrompt,
                session.toolUseSystemPrompt,
                withRetryPrompt ? session.toolRetrySystemPrompt : undefined
            ),
            ...session.langChainMessages,
        ]
    }

    private async runPlanningAttempt(
        session: ReturnType<typeof createChatSession>,
        withRetryPrompt: boolean
    ): Promise<PlanningAttemptResult> {
        if (!session.toolBoundModel) {
            throw new Error('toolBoundModel is required for planning stage')
        }

        // Planning stage consumes one bound-model stream and folds it into:
        // 1. executable tool calls
        // 2. normalized validation errors
        // 3. visibility status for assistant text content
        const planningStream = await session.toolBoundModel.stream(this.buildPlanningMessages(session, withRetryPrompt), {
            signal: this.context.signal,
        })
        const response = await streamPlanningResponse(planningStream, this.context, this.writeChunk, this.isClosed)
        const validationResult = normalizeAndValidateToolCalls(response)
        const hasVisibleText = hasVisibleAssistantText(response)

        logSkillRuntime(withRetryPrompt ? 'retry-finished' : 'planning-finished', {
            skill: session.skillDefinition?.skillId ?? null,
            toolCalls: validationResult.toolCalls.map(toolCall => toolCall.name),
            hasVisibleText,
            validationErrors: validationResult.toolErrors.length,
        })

        return {
            hasVisibleText,
            validationResult,
        }
    }

    private toPlanningStageResult(attempt: PlanningAttemptResult): PlanningStageResult {
        if (attempt.validationResult.toolCalls.length === 0) {
            return {
                kind: 'validation-only',
                toolErrors: attempt.validationResult.toolErrors,
            }
        }

        return {
            kind: 'tooling',
            planningMessage: attempt.validationResult.planningMessage,
            toolCalls: attempt.validationResult.toolCalls,
            toolErrors: attempt.validationResult.toolErrors,
        }
    }

    private async runPlanningStage(session: ReturnType<typeof createChatSession>): Promise<PlanningStageResult> {
        const firstAttempt = await this.runPlanningAttempt(session, false)

        if (firstAttempt.validationResult.toolCalls.length === 0 && !firstAttempt.hasVisibleText) {
            const retryAttempt = await this.runPlanningAttempt(session, true)

            if (retryAttempt.validationResult.toolCalls.length === 0 && !retryAttempt.hasVisibleText) {
                return {
                    kind: 'direct-fallback',
                }
            }

            return this.toPlanningStageResult(retryAttempt)
        }

        return this.toPlanningStageResult(firstAttempt)
    }

    private async runToolExecutionStage(
        toolCalls: ToolCall[],
        toolErrors: ToolValidationResult['toolErrors']
    ): Promise<ToolExecutionStageResult> {
        const toolMessages: ToolMessage[] = [...writeToolValidationErrors(toolErrors, { writeChunk: this.writeChunk, stage: 'planning' })]
        const executedToolResults: ExecutedToolResult[] = []

        for (const toolCall of toolCalls) {
            const executedToolResult = await executeToolCall(toolCall, this.context, this.writeChunk, {
                errorStage: 'tool-execution',
            })
            executedToolResults.push(executedToolResult)
            toolMessages.push(executedToolResult.toolMessage)
        }

        return {
            executedToolResults,
            toolMessages,
        }
    }

    private async runFinalAnswerStage(
        session: ReturnType<typeof createChatSession>,
        planningMessage: AIMessage,
        executedToolResults: ExecutedToolResult[],
        toolMessages: ToolMessage[]
    ) {
        throwIfAborted(this.context.signal)

        let promptContextMessages: BaseMessage[] = []
        const promptInvocation = resolvePromptContextInvocation(this.request, executedToolResults)

        if (promptInvocation) {
            const promptPartId = createId()

            this.writeChunk({
                type: 'prompt-start',
                partId: promptPartId,
                promptName: promptInvocation.promptName,
                source: promptInvocation.source,
                location: promptInvocation.location,
                serverId: promptInvocation.serverId,
                input: promptInvocation.input,
            })

            try {
                promptContextMessages = await promptInvocation.execute()
                this.writeChunk({
                    type: 'prompt-end',
                    partId: promptPartId,
                    promptName: promptInvocation.promptName,
                    source: promptInvocation.source,
                    location: promptInvocation.location,
                    serverId: promptInvocation.serverId,
                    status: 'completed',
                    messageCount: promptContextMessages.length,
                })
            } catch (error) {
                const promptError =
                    error instanceof PromptRuntimeError
                        ? error
                        : new PromptRuntimeError(
                              'PROMPT_FETCH_FAILED',
                              error instanceof Error ? error.message : 'Prompt context build failed.',
                              {
                                  promptName: promptInvocation.promptName,
                                  serverId: promptInvocation.serverId,
                              }
                          )

                writeStreamErrorChunk(this.writeChunk, {
                    scope: 'prompt',
                    errorCode: promptError.code,
                    retryable: true,
                    message: promptError.message,
                    stage: 'final-answer',
                    partId: promptPartId,
                    source: promptInvocation.source,
                    location: promptInvocation.location,
                    serverId: promptError.serverId,
                    promptName: promptError.promptName,
                })
                this.writeChunk({
                    type: 'prompt-end',
                    partId: promptPartId,
                    promptName: promptInvocation.promptName,
                    source: promptInvocation.source,
                    location: promptInvocation.location,
                    serverId: promptInvocation.serverId,
                    status: 'failed',
                    messageCount: 0,
                })
            }
        }

        // Final-answer stage turns planning + tool outputs into natural-language closure.
        const finalMessages: BaseMessage[] = [
            ...buildSystemMessages(
                session.skillSystemPrompt,
                session.skillOutputPolicyPrompt,
                session.toolUseSystemPrompt,
                session.toolResultSystemPrompt
            ),
            ...session.langChainMessages,
            stripMessageText(planningMessage),
            ...toolMessages,
            ...promptContextMessages,
        ]
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        await streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed)
    }

    private async runCapabilityContextAnswerStage(session: ReturnType<typeof createChatSession>) {
        // Step 3.5 的能力消费入口：先判断本轮是否命中固定 remote capability 场景。
        // 命中后由 runtime 主动获取上下文，再进入最终回答阶段；未命中则继续原有 tool/direct-answer 链路。
        const capabilityInvocations = resolveCapabilityContextInvocations(this.request, session.skillDefinition)

        if (capabilityInvocations.length === 0) {
            return false
        }

        const capabilityContextMessages = await executeCapabilityContextInvocations(capabilityInvocations, {
            context: this.context,
            writeChunk: this.writeChunk,
        })
        const finalMessages: BaseMessage[] = [
            ...buildSystemMessages(
                session.skillSystemPrompt,
                session.skillOutputPolicyPrompt,
                // 这条 prompt 只约束 Step 3.5 的最终回答阶段，避免模型把内部注入状态暴露给用户。
                '请优先基于本轮 runtime 已获取的 capability 结果或 Prompt 指令回答；不要向用户暴露“已注入/未注入上下文”等内部执行状态。如果某个 capability 调用失败，请简短说明能力暂时不可用，不要编造未获取到的信息。'
            ),
            ...session.langChainMessages,
            ...capabilityContextMessages,
        ]
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        await streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed)

        return true
    }

    async run() {
        const lifecycle = new StreamLifecycle({
            context: this.context,
            isClosed: this.isClosed,
            writeChunk: this.writeChunk,
        })

        try {
            const session = createChatSession(this.request, this.deps)

            throwIfAborted(this.context.signal)

            logSkillRuntime('request-start', {
                requestedSkill: this.request.options?.skill ?? null,
                resolvedSkill: session.skillDefinition?.skillId ?? null,
                activeTools: session.activeToolNames,
            })

            lifecycle.emitStartOnce()

            if (session.skillDefinition) {
                this.writeChunk({
                    type: 'skill-selected',
                    skillId: session.skillDefinition.skillId,
                    name: session.skillDefinition.name,
                    description: session.skillDefinition.description,
                })
            }

            if (await this.runCapabilityContextAnswerStage(session)) {
                lifecycle.emitFinishIfOpen()
                return
            }

            if (!session.toolBoundModel) {
                await streamDirectAnswer(session.baseModel, session.directAnswerMessages, this.context, this.writeChunk, this.isClosed)
                lifecycle.emitFinishIfOpen()
                return
            }

            const planningStage = await this.runPlanningStage(session)

            if (planningStage.kind === 'direct-fallback') {
                await streamDirectAnswer(session.baseModel, session.directAnswerMessages, this.context, this.writeChunk, this.isClosed)
                lifecycle.emitFinishIfOpen()
                return
            }

            if (planningStage.kind === 'validation-only') {
                writeToolValidationErrors(planningStage.toolErrors, { writeChunk: this.writeChunk, stage: 'planning' })
                lifecycle.emitFinishIfOpen()
                return
            }

            const toolExecutionResult = await this.runToolExecutionStage(planningStage.toolCalls, planningStage.toolErrors)
            const canBypassModel = shouldBypassAuthoritativeAnswer({
                request: this.request,
                executedToolResults: toolExecutionResult.executedToolResults,
            })
            const authoritativeDecision = canBypassModel
                ? decideAuthoritativeToolAnswer(toolExecutionResult.executedToolResults, formatToolInput)
                : {
                      shouldBypassModel: false,
                      toolNames: toolExecutionResult.executedToolResults.map(result => result.toolCall.name),
                  }

            if (authoritativeDecision.shouldBypassModel) {
                logSkillRuntime('authoritative-answer', {
                    skill: session.skillDefinition?.skillId ?? null,
                    reason: authoritativeDecision.reason ?? null,
                    tools: authoritativeDecision.toolNames,
                })
                writeStaticTextPart(this.writeChunk, authoritativeDecision.answerText ?? '')
                lifecycle.emitFinishIfOpen()
                return
            }

            await this.runFinalAnswerStage(
                session,
                planningStage.planningMessage,
                toolExecutionResult.executedToolResults,
                toolExecutionResult.toolMessages
            )
            lifecycle.emitFinishIfOpen()
        } catch (error) {
            if (isAbortError(error) || this.context.signal?.aborted || this.isClosed()) {
                throw error
            }

            if (isInvalidSkillError(error)) {
                throw error
            }

            lifecycle.emitRuntimeErrorOnce({
                errorCode: 'MODEL_STREAM_FAILED',
                retryable: true,
                message: 'Model streaming failed.',
                stage: 'runtime',
            })
        }
    }
}
