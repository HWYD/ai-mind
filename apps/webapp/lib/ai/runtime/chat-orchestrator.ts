import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { StreamErrorCode } from '@ai-mind/stream-core/protocol'
import type { AIMessage, BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'

import { createId } from '@/lib/ai/create-id'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import type { AiMindChatModelHandle } from '@/lib/ai/model-provider'
import { logProviderError, validateInputLength } from '@/lib/ai/model-provider'
import type { ChatRequest } from '@/lib/ai/types/chat'

import { hasVisibleAssistantText, streamAssistantParts, streamPlanningResponse, stripMessageText } from './assistant-stream'
import { decideAuthoritativeToolAnswer, shouldBypassAuthoritativeAnswer } from './authoritative-answer'
import { executeCapabilityContextInvocations, resolveCapabilityContextInvocations } from './capability-context'
import {
    buildChatConversationThreadId,
    buildChatMemoryContextMessages,
    chatMemoryService,
    conversationRegistryService,
    type FinalTurnSource,
    isChatMemoryContextEligibleRequest,
    isChatMemoryWriteEligibleRequest,
    type ThreadMemoryStatusEvent,
} from './chat-memory'
import { buildSystemMessages, createChatSession, withChatMemoryContextMessages } from './chat-session'
import { executeComposerContextInvocation, resolveComposerContextInvocation } from './composer-context'
import { startDeliveryChainRun } from './delivery-chain'
import { PromptRuntimeError, resolvePromptContextInvocation } from './prompt-context'
import { logSkillRuntime, normalizeKnownRuntimeError, throwIfAborted, writeStreamErrorChunk } from './stream-errors'
import { executeToolCall, formatToolInput, normalizeAndValidateToolCalls, writeToolValidationErrors } from './tool-runtime'
import type {
    ChatExecutionContext,
    ChatSession,
    ExecutedToolResult,
    ResolvedChatExecutionContext,
    ToolValidationResult,
    WriteChunk,
} from './types'
import { buildUserMemoryContextMessages, processCompletedTurnForMemory, userMemoryService } from './user-memory'
import {
    createTasklistAgentModelSet,
    createVersionPlanTasklistAgentSkeleton,
    getTasklistAgentRuntimeConfig,
    resolveVersionPlanTasklistAgentInvocation,
    startVersionPlanTasklistAgentRun,
} from './version-plan-tasklist-agent'

interface ChatOrchestratorOptions {
    context: ResolvedChatExecutionContext
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

// ChatOrchestrator 是单轮聊天请求的总调度器：
// - 更具体的结构化能力先尝试接管，例如 v0.1.0 的受控单 Agent。
// - 未命中结构化能力时，再依次回落到 Composer Context、Capability Context、Tool Calling 或普通直答。
// 这里不直接实现具体 Agent / Tool / Resource 细节，只负责确定本轮应该走哪条主链路。
async function streamDirectAnswer(
    model: ChatSession['baseModel'],
    langChainMessages: BaseMessage[],
    context: ChatExecutionContext,
    writeChunk: WriteChunk,
    isClosed: () => boolean,
    emitReasoning: boolean
) {
    validateInputLength(langChainMessages)
    const stream = await model.stream(langChainMessages, {
        signal: context.signal,
    })

    return streamAssistantParts(stream, context, writeChunk, isClosed, emitReasoning)
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

function isUserMemoryContextEligibleRequest(request: ChatRequest): boolean {
    return !request.composer?.command
}

function isUserMemoryWriteEligibleRequest(request: ChatRequest, source: FinalTurnSource): boolean {
    return !request.composer?.command && (source === 'chat' || source === 'tool')
}

function isDraftConversationIdentity(conversationId: string | undefined): boolean {
    const normalized = conversationId?.trim()

    return normalized === '__draft__' || normalized?.startsWith('__draft__:') === true
}

export class ChatOrchestrator {
    private readonly context: ResolvedChatExecutionContext
    private readonly isClosed: () => boolean
    private readonly request: ChatRequest
    private readonly writeChunk: WriteChunk
    private readonly assistantMessageId = createId()
    private memoryContextMessages: BaseMessage[] = []
    private modelHandle: AiMindChatModelHandle | null = null

    constructor(options: ChatOrchestratorOptions) {
        this.context = options.context
        this.isClosed = options.isClosed
        this.request = options.request
        this.writeChunk = options.writeChunk
    }

    private shouldEmitReasoning() {
        return this.request.options?.enableReasoning !== false
    }

    private writeThreadMemoryStatus(event: ThreadMemoryStatusEvent) {
        this.writeChunk({
            type: 'thread-memory-status',
            status: event.status,
            message: event.message,
            ...(typeof event.summaryLength === 'number' ? { summaryLength: event.summaryLength } : {}),
            ...(typeof event.pinnedDecisionCount === 'number' ? { pinnedDecisionCount: event.pinnedDecisionCount } : {}),
        })
    }

    private resolveValidatedConversationId() {
        const validatedConversationId = this.context.validatedConversationId?.trim()

        if (validatedConversationId && validatedConversationId !== this.request.conversationId) {
            throw new Error('Validated conversation ownership does not match the incoming request conversationId.')
        }

        return validatedConversationId || this.request.conversationId
    }

    private resolveConversationThreadId() {
        if (!this.context.sessionId) {
            return null
        }

        return buildChatConversationThreadId(this.context.sessionId, this.resolveValidatedConversationId())
    }

    private async appendCompletedChatMemoryTurn(assistantText: string | undefined, source: FinalTurnSource = 'chat') {
        const normalizedAssistantText = assistantText?.trim()

        if (!normalizedAssistantText) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'empty-assistant-text',
            })
            return
        }

        if (!this.context.sessionId) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'missing-session',
            })
            return
        }

        if (!isChatMemoryWriteEligibleRequest(this.request, source)) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'ineligible-request',
                source,
            })
            return
        }

        if (this.context.signal?.aborted) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'request-aborted',
            })
            return
        }

        const userText = getLastUserMessageText(this.request)

        if (!userText) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'empty-user-text',
            })
            return
        }

        let sourceConversationId: string
        let threadId: string | null

        try {
            sourceConversationId = this.resolveValidatedConversationId()
            threadId = buildChatConversationThreadId(this.context.sessionId, sourceConversationId)
        } catch (error) {
            logSkillRuntime('chat-memory-append-failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
                stage: 'conversation-resolution',
            })
            return
        }

        if (!threadId) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'missing-thread',
            })
            return
        }

        try {
            await chatMemoryService.appendCompletedTurn(
                threadId,
                {
                    assistantMessageId: this.assistantMessageId,
                    assistantText: normalizedAssistantText,
                    source,
                    userText,
                },
                {
                    onStatus: event => this.writeThreadMemoryStatus(event),
                    promotionContext: {
                        sessionId: this.context.sessionId,
                        sourceConversationId,
                    },
                }
            )
        } catch (error) {
            logSkillRuntime('chat-memory-append-failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
                stage: 'append-turn',
            })
            // Chat memory 是可降级能力，失败不影响已经完成的用户回答。
        }

        try {
            await conversationRegistryService.touchConversation(this.context.sessionId, sourceConversationId, {
                hasMessages: true,
            })
        } catch (error) {
            logSkillRuntime('chat-memory-append-failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
                stage: 'touch-conversation',
            })
        }

        void this.enqueueCompletedUserMemoryExtraction({
            assistantText: normalizedAssistantText,
            source,
            userText,
        })
    }

    private async enqueueCompletedUserMemoryExtraction(input: { assistantText: string; source: FinalTurnSource; userText: string }) {
        try {
            if (!this.context.sessionId) {
                return
            }

            if (!isUserMemoryWriteEligibleRequest(this.request, input.source)) {
                return
            }

            const sourceConversationId = this.resolveValidatedConversationId()?.trim()

            if (!sourceConversationId || isDraftConversationIdentity(sourceConversationId)) {
                return
            }

            let safeShortTermContext:
                | {
                      pinnedDecisions?: string[]
                      summary?: string
                  }
                | undefined

            try {
                const threadId = this.resolveConversationThreadId()

                if (threadId) {
                    const threadState = await chatMemoryService.readThreadState(threadId)
                    safeShortTermContext = {
                        pinnedDecisions: threadState.state.pinnedDecisions,
                        summary: threadState.state.summary,
                    }
                }
            } catch {
                safeShortTermContext = undefined
            }

            const result = await processCompletedTurnForMemory({
                assistantFinalText: input.assistantText,
                latestUserText: input.userText,
                path: input.source === 'tool' ? 'tool_assisted_ordinary_chat' : 'ordinary_chat',
                safeShortTermContext,
                sessionId: this.context.sessionId,
                sourceConversationId,
            })

            logSkillRuntime('user-memory-post-turn-processed', {
                resultStatus: result.status,
                source: input.source,
            })
        } catch (error) {
            logSkillRuntime('user-memory-post-turn-failed', {
                errorName: error instanceof Error ? error.name : 'UnknownError',
                source: input.source,
            })
        }
    }

    private async resolveUserMemoryContextMessages() {
        if (!this.context.sessionId || !isUserMemoryContextEligibleRequest(this.request)) {
            return []
        }

        const latestUserText = getLastUserMessageText(this.request)

        if (!latestUserText) {
            return []
        }

        try {
            const selectedUserMemories = await userMemoryService.retrieveRelevantMemories({
                latestUserText,
                sessionId: this.context.sessionId,
            })

            return buildUserMemoryContextMessages(selectedUserMemories)
        } catch {
            return []
        }
    }

    private async resolveChatMemoryContextMessages() {
        if (!this.context.sessionId || !isChatMemoryContextEligibleRequest(this.request)) {
            return []
        }

        const threadId = this.resolveConversationThreadId()

        if (!threadId) {
            return []
        }

        try {
            const result = await chatMemoryService.readThreadState(threadId)

            return buildChatMemoryContextMessages(result.state)
        } catch {
            return []
        }
    }

    private async resolveConversationMemoryContextMessages() {
        const [userMemoryContextMessages, chatMemoryContextMessages] = await Promise.all([
            this.resolveUserMemoryContextMessages(),
            this.resolveChatMemoryContextMessages(),
        ])

        return [...userMemoryContextMessages, ...chatMemoryContextMessages]
    }

    private buildPlanningMessages(session: ChatSession, withRetryPrompt: boolean) {
        // 普通 Tool Calling 的 planning 阶段仍沿用 Skill + Tool prompt 组合。
        return withChatMemoryContextMessages(
            [
                ...buildSystemMessages(
                    session.skillSystemPrompt,
                    session.skillOutputPolicyPrompt,
                    session.toolUseSystemPrompt,
                    withRetryPrompt ? session.toolRetrySystemPrompt : undefined
                ),
                ...session.langChainMessages,
            ],
            this.memoryContextMessages
        )
    }

    private async runPlanningAttempt(session: ChatSession, withRetryPrompt: boolean): Promise<PlanningAttemptResult> {
        if (!session.toolBoundModel) {
            throw new Error('toolBoundModel is required for planning stage')
        }

        const planningMessages = this.buildPlanningMessages(session, withRetryPrompt)
        validateInputLength(planningMessages)

        // Planning stage consumes one bound-model stream and folds it into:
        // - executable tool calls
        // - normalized validation errors
        // - visibility status for assistant text content
        const planningStream = await session.toolBoundModel.stream(planningMessages, {
            signal: this.context.signal,
        })
        const response = await streamPlanningResponse(
            planningStream,
            this.context,
            this.writeChunk,
            this.isClosed,
            this.shouldEmitReasoning()
        )
        const validationResult = normalizeAndValidateToolCalls(response, session.activeToolDefinitionMap)
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

    private async runPlanningStage(session: ChatSession): Promise<PlanningStageResult> {
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
        session: ChatSession,
        toolCalls: ToolCall[],
        toolErrors: ToolValidationResult['toolErrors']
    ): Promise<ToolExecutionStageResult> {
        const toolMessages: ToolMessage[] = [...writeToolValidationErrors(toolErrors, { writeChunk: this.writeChunk, stage: 'planning' })]
        const executedToolResults: ExecutedToolResult[] = []

        for (const toolCall of toolCalls) {
            const executedToolResult = await executeToolCall(toolCall, this.context, this.writeChunk, {
                errorStage: 'tool-execution',
                toolDefinitionMap: session.activeToolDefinitionMap,
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
        session: ChatSession,
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

        // 普通 Tool Calling 的最终回答阶段：把 planning 消息、ToolMessage 和可选 Prompt 上下文合并，
        // 再交给基础模型生成自然语言收束。Agent 的最终回答由 Agent runner 自己生成，不复用这里。
        const finalMessages: BaseMessage[] = withChatMemoryContextMessages(
            [
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
            ],
            this.memoryContextMessages
        )
        validateInputLength(finalMessages)
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        return streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed, this.shouldEmitReasoning())
    }

    private async runCapabilityContextAnswerStage(session: ChatSession): Promise<false | string> {
        // Capability Context 是比普通 Tool Calling 更早的“上下文注入”分支。
        // 它只处理固定 capability 场景，例如 remote resource / prompt 已被 runtime 主动解析出的情况。
        // 命中后由 runtime 主动获取上下文，再进入最终回答阶段；未命中则继续原有 tool/direct-answer 链路。
        const capabilityInvocations = resolveCapabilityContextInvocations(this.request, session.skillDefinition)

        if (capabilityInvocations.length === 0) {
            return false
        }

        const capabilityContextMessages = await executeCapabilityContextInvocations(capabilityInvocations, {
            context: this.context,
            writeChunk: this.writeChunk,
        })
        const finalMessages: BaseMessage[] = withChatMemoryContextMessages(
            [
                ...buildSystemMessages(
                    session.skillSystemPrompt,
                    session.skillOutputPolicyPrompt,
                    // 这条 prompt 只约束 capability context 的最终回答，避免模型把内部注入状态暴露给用户。
                    '请优先基于本轮 runtime 已获取的 capability 结果或 Prompt 指令回答；不要向用户暴露“已注入/未注入上下文”等内部执行状态。如果某个 capability 调用失败，请简短说明能力暂时不可用，不要编造未获取到的信息。'
                ),
                ...session.langChainMessages,
                ...capabilityContextMessages,
            ],
            this.memoryContextMessages
        )
        validateInputLength(finalMessages)
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        return streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed, this.shouldEmitReasoning())
    }

    private async runComposerContextAnswerStage(session: ChatSession): Promise<false | string> {
        // Composer Context 处理用户在输入框里显式选择的 command / reference。
        // 注意：/tasklist + demo://version-plans/*.md 会先被 Agent 分支接管，不会落到这里变成普通 docs summary。
        const composerInvocation = resolveComposerContextInvocation(this.request)

        if (!composerInvocation) {
            return false
        }

        const composerContextMessages = await executeComposerContextInvocation(composerInvocation, {
            context: this.context,
            writeChunk: this.writeChunk,
        })
        const finalMessages: BaseMessage[] = withChatMemoryContextMessages(
            [
                ...buildSystemMessages(
                    session.skillSystemPrompt,
                    session.skillOutputPolicyPrompt,
                    '请优先基于本轮 Composer 引用读取到的上下文或 Prompt 指令回答；不要向用户暴露“已注入上下文”等内部执行状态。如果资源或 Prompt 获取失败，请简短说明能力暂时不可用，不要编造未获取到的信息。'
                ),
                ...session.langChainMessages,
                ...composerContextMessages,
            ],
            this.memoryContextMessages
        )
        validateInputLength(finalMessages)
        const finalStream = await session.baseModel.stream(finalMessages, {
            signal: this.context.signal,
        })

        return streamAssistantParts(finalStream, this.context, this.writeChunk, this.isClosed, this.shouldEmitReasoning())
    }

    private async runVersionPlanTasklistAgentEntryStage(session: ChatSession) {
        // v0.1.0 的受控单 Agent 当前仍挂在 runtime 下：
        // 它不是通用 Agent 平台，而是一条明确的 Runtime-controlled 主路径。
        //
        // 入口必须同时满足：
        // - Composer command 是 /tasklist。
        // - 用户显式引用 demo://version-plans/*.md。
        //
        // 命中后会读取 version plan、生成 planExtract，并继续执行 draft -> validate -> maybe revise -> final。
        // 整条 Agent 链路完成后会短路普通 Composer Context、Capability Context 和 Tool Calling。
        const agentInvocation = resolveVersionPlanTasklistAgentInvocation(this.request)

        if (!agentInvocation) {
            return false
        }

        if (agentInvocation.kind === 'missing-version-plan') {
            writeStaticTextPart(
                this.writeChunk,
                '请先通过 @demo://version-plans/*.md 引用一个公开 demo 版本方案，再生成 tasklist 草稿。本版不支持只根据目标直接生成 tasklist。'
            )
            return true
        }

        if (agentInvocation.kind === 'legacy-version-plan') {
            writeStaticTextPart(
                this.writeChunk,
                '该路径已弃用。请改用 @demo://version-plans/*.md，例如 /tasklist + @demo://version-plans/v034-langsmith-observability.md。'
            )
            return true
        }

        if (agentInvocation.kind === 'invalid-local-resource') {
            writeStaticTextPart(
                this.writeChunk,
                '公开 Tasklist Agent 只接受 @demo://version-plans/*.md。请不要使用 @file://、绝对路径、../ 或其他本地目录资源。'
            )
            return true
        }

        const skeletonResult = createVersionPlanTasklistAgentSkeleton(agentInvocation)

        logSkillRuntime('version-plan-tasklist-agent-skeleton', {
            runId: skeletonResult.runId,
            versionPlanUri: skeletonResult.versionPlanReference.uri,
        })

        const runtimeConfig = getTasklistAgentRuntimeConfig()
        const models = createTasklistAgentModelSet({
            enableReasoning: this.request.options?.enableReasoning,
            resolvedModelSelection: this.context.resolvedModelSelection,
        })
        const userGoal = getLastUserMessageText(this.request)
        const sessionId = this.context.sessionId

        if (!sessionId) {
            throw new Error('Tasklist Agent requires an owned chat session.')
        }

        logSkillRuntime('version-plan-tasklist-agent-runtime-selected', {
            graphCheckpointMode: runtimeConfig.graphCheckpointMode,
            graphDebugViewEnabled: runtimeConfig.graphDebugViewEnabled,
            graphEventsEnabled: runtimeConfig.graphEventsEnabled,
        })

        await startVersionPlanTasklistAgentRun({
            assistantMessageId: this.assistantMessageId,
            context: this.context,
            conversationId: this.request.conversationId,
            modelId: this.context.resolvedModelSelection.modelId,
            modelProvider: this.context.resolvedModelSelection.provider,
            models,
            reasoningEnabled: this.shouldEmitReasoning(),
            runId: skeletonResult.runId,
            runtimeConfig,
            sessionId,
            userGoal,
            versionPlanReference: skeletonResult.versionPlanReference,
            writeChunk: this.writeChunk,
        })

        return true
    }

    private async runDeliveryChainEntryStage(session: ChatSession) {
        return startDeliveryChainRun({
            context: this.context,
            modelHandle: session.modelHandle,
            request: this.request,
            resolvedModelSelection: this.context.resolvedModelSelection,
            writeChunk: this.writeChunk,
        })
    }

    async run() {
        const lifecycle = new StreamLifecycle({
            context: this.context,
            isClosed: this.isClosed,
            writeChunk: this.writeChunk,
        })

        try {
            // 先发 start，让前端立即创建 assistant 占位。
            // createChatSession 会解析 Skill / Tool Binding，Agent 场景还可能命中远端 capability 可用性判断；
            // 如果等这些前置准备完成再发首包，用户会看到“按钮已禁用但消息区空白”的假死状态。
            lifecycle.emitStartOnce(this.assistantMessageId)

            const session = await createChatSession(this.request, this.context.resolvedModelSelection)

            this.modelHandle = session.modelHandle
            this.memoryContextMessages = await this.resolveConversationMemoryContextMessages()

            throwIfAborted(this.context.signal)

            logSkillRuntime('request-start', {
                requestedSkill: this.request.options?.skill ?? null,
                resolvedSkill: session.skillDefinition?.skillId ?? null,
                activeTools: session.activeToolNames,
            })

            if (session.skillDefinition) {
                this.writeChunk({
                    type: 'skill-selected',
                    skillId: session.skillDefinition.skillId,
                    name: session.skillDefinition.name,
                    description: session.skillDefinition.description,
                })
            }

            // 主链路优先级从“最具体”到“最通用”：
            // - 受控 Agent：/tasklist + version plan，完整接管本轮。
            // - 受控 workflow：/delivery-chain + scenario 或 inline requirement。
            // - Composer Context：/summary、@resource 等普通结构化输入。
            // - Capability Context：runtime 主动消费的固定 capability 场景。
            // - Tool Calling：模型自行决定是否调用已绑定工具。
            // - Direct Answer：没有工具或无需工具时直接回答。
            if (await this.runVersionPlanTasklistAgentEntryStage(session)) {
                lifecycle.emitFinishIfOpen()
                return
            }

            if (await this.runDeliveryChainEntryStage(session)) {
                lifecycle.emitFinishIfOpen()
                return
            }

            const composerAssistantText = await this.runComposerContextAnswerStage(session)

            if (composerAssistantText !== false) {
                await this.appendCompletedChatMemoryTurn(composerAssistantText, 'mcp-resource')
                lifecycle.emitFinishIfOpen()
                return
            }

            const capabilityAssistantText = await this.runCapabilityContextAnswerStage(session)

            if (capabilityAssistantText !== false) {
                await this.appendCompletedChatMemoryTurn(capabilityAssistantText, 'mcp-resource')
                lifecycle.emitFinishIfOpen()
                return
            }

            if (!session.toolBoundModel) {
                const assistantText = await streamDirectAnswer(
                    session.baseModel,
                    withChatMemoryContextMessages(session.directAnswerMessages, this.memoryContextMessages),
                    this.context,
                    this.writeChunk,
                    this.isClosed,
                    this.shouldEmitReasoning()
                )
                await this.appendCompletedChatMemoryTurn(assistantText, 'chat')
                lifecycle.emitFinishIfOpen()
                return
            }

            const planningStage = await this.runPlanningStage(session)

            if (planningStage.kind === 'direct-fallback') {
                const assistantText = await streamDirectAnswer(
                    session.baseModel,
                    withChatMemoryContextMessages(session.directAnswerMessages, this.memoryContextMessages),
                    this.context,
                    this.writeChunk,
                    this.isClosed,
                    this.shouldEmitReasoning()
                )
                await this.appendCompletedChatMemoryTurn(assistantText, 'chat')
                lifecycle.emitFinishIfOpen()
                return
            }

            if (planningStage.kind === 'validation-only') {
                writeToolValidationErrors(planningStage.toolErrors, { writeChunk: this.writeChunk, stage: 'planning' })
                lifecycle.emitFinishIfOpen()
                return
            }

            const toolExecutionResult = await this.runToolExecutionStage(session, planningStage.toolCalls, planningStage.toolErrors)
            const canBypassModel = shouldBypassAuthoritativeAnswer({
                request: this.request,
                toolDefinitionMap: session.activeToolDefinitionMap,
                executedToolResults: toolExecutionResult.executedToolResults,
            })
            const authoritativeDecision = canBypassModel
                ? decideAuthoritativeToolAnswer(toolExecutionResult.executedToolResults, session.activeToolDefinitionMap, toolCall =>
                      formatToolInput(toolCall, session.activeToolDefinitionMap)
                  )
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
                await this.appendCompletedChatMemoryTurn(authoritativeDecision.answerText ?? '', 'tool')
                lifecycle.emitFinishIfOpen()
                return
            }

            const assistantText = await this.runFinalAnswerStage(
                session,
                planningStage.planningMessage,
                toolExecutionResult.executedToolResults,
                toolExecutionResult.toolMessages
            )
            await this.appendCompletedChatMemoryTurn(assistantText, 'tool')
            lifecycle.emitFinishIfOpen()
        } catch (error) {
            if (isAbortError(error) || this.context.signal?.aborted || this.isClosed()) {
                throw error
            }

            if (isInvalidSkillError(error)) {
                throw error
            }

            const knownRuntimeError = normalizeKnownRuntimeError(error)

            if (knownRuntimeError) {
                lifecycle.emitRuntimeErrorOnce({
                    errorCode: knownRuntimeError.code,
                    retryable: knownRuntimeError.retryable,
                    message: knownRuntimeError.message,
                    stage: 'runtime',
                })
                return
            }

            // 使用 Provider 层 normalizeError 产出标准化 stream error chunk
            logProviderError(error)
            const normalized = this.modelHandle?.normalizeError(error) ?? {
                code: 'MODEL_STREAM_FAILED',
                message: 'Model streaming failed.',
                retryable: true,
                logMeta: {},
            }

            lifecycle.emitRuntimeErrorOnce({
                errorCode: normalized.code as StreamErrorCode,
                retryable: normalized.retryable,
                message: normalized.message,
                stage: 'runtime',
            })
        }
    }
}
