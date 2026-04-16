import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { AIMessage, BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'

import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import type { ChatRequest } from '@/lib/ai/types/chat'

import { hasVisibleAssistantText, streamAssistantParts, streamPlanningResponse, stripMessageText } from './assistant-stream'
import { decideAuthoritativeToolAnswer, shouldBypassAuthoritativeAnswer } from './authoritative-answer'
import { buildSystemMessages, createChatSession } from './chat-session'
import { logSkillRuntime, throwIfAborted } from './stream-errors'
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

        // planning 阶段先消费一轮绑定了 tools 的模型输出，再把结果统一收敛成：
        // 1. 可执行的 tool calls
        // 2. 结构化校验错误
        // 3. 是否已包含可直接展示给用户的正文
        const planningStream = await session.toolBoundModel.stream(this.buildPlanningMessages(session, withRetryPrompt), {
            signal: this.context.signal,
        })
        const response = await streamPlanningResponse(planningStream, this.context, this.writeChunk, this.isClosed)
        const validationResult = normalizeAndValidateToolCalls(response)
        const hasVisibleText = hasVisibleAssistantText(response)

        logSkillRuntime(withRetryPrompt ? 'retry-finished' : 'planning-finished', {
            skill: session.skillDefinition?.name ?? null,
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
        // 规划阶段如果没有有效 tool call，就按“仅校验”或“纯直出”两类收口。
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
        // 先走第一轮规划；如果既没有 tool call 也没有可见文本，再补一次 retry prompt。
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
        // 先把规划阶段产生的校验错误写回流，再逐个执行真正可用的 tool call。
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
        toolMessages: ToolMessage[]
    ) {
        throwIfAborted(this.context.signal)

        // final-answer 阶段只负责把规划结果和 tool 结果整理成自然语言收口，不再允许模型二次调 tool。
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
        ]
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        await streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed)
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

            // 记录一次请求级上下文，便于后续定位 resolved skill 和激活工具。
            logSkillRuntime('request-start', {
                requestedSkill: this.request.options?.skill ?? null,
                resolvedSkill: session.skillDefinition?.name ?? null,
                activeTools: session.activeToolNames,
            })

            lifecycle.emitStartOnce()

            // 没有可用 tool 时，直接走普通问答流。
            if (!session.toolBoundModel) {
                await streamDirectAnswer(session.baseModel, session.directAnswerMessages, this.context, this.writeChunk, this.isClosed)
                lifecycle.emitFinishIfOpen()
                return
            }

            // 有 tool 时先做规划，决定是直出、仅校验，还是进入 tool 执行。
            const planningStage = await this.runPlanningStage(session)

            // 规划阶段完全没有有效产物时，回退到 direct answer。
            if (planningStage.kind === 'direct-fallback') {
                await streamDirectAnswer(session.baseModel, session.directAnswerMessages, this.context, this.writeChunk, this.isClosed)
                lifecycle.emitFinishIfOpen()
                return
            }

            // 只有校验错误、没有可执行 tool 时，直接把校验结果回流并结束。
            if (planningStage.kind === 'validation-only') {
                writeToolValidationErrors(planningStage.toolErrors, { writeChunk: this.writeChunk, stage: 'planning' })
                lifecycle.emitFinishIfOpen()
                return
            }

            // 先执行所有可用 tool，再决定是否可以 authoritative 直出。
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

            // 如果结果足够确定，就跳过最终模型整理，直接写静态答案。
            if (authoritativeDecision.shouldBypassModel) {
                logSkillRuntime('authoritative-answer', {
                    skill: session.skillDefinition?.name ?? null,
                    reason: authoritativeDecision.reason ?? null,
                    tools: authoritativeDecision.toolNames,
                })
                writeStaticTextPart(this.writeChunk, authoritativeDecision.answerText ?? '')
                lifecycle.emitFinishIfOpen()
                return
            }

            // 需要模型整理时，进入 final answer 阶段。
            await this.runFinalAnswerStage(session, planningStage.planningMessage, toolExecutionResult.toolMessages)
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
