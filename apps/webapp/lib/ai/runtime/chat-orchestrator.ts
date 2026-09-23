import { StreamLifecycle, writeStaticTextPart } from '@ai-mind/stream-core'
import type { ChatStreamChunk, StreamErrorCode } from '@ai-mind/stream-core/protocol'
import type { BaseMessage } from '@langchain/core/messages'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'

import { createId } from '@/lib/ai/create-id'
import { isAbortError, isInvalidSkillError } from '@/lib/ai/error-utils'
import type { AiMindChatModelHandle } from '@/lib/ai/model-provider'
import { logProviderError } from '@/lib/ai/model-provider'
import type { StreamTerminalStateDto } from '@/lib/ai/stream-recovery/contracts'
import type { ChatRequest } from '@/lib/ai/types/chat'

import { type ChatContextPreflight, createChatContextPreflight } from './chat-context-preflight'
import {
    buildChatConversationThreadId,
    chatMemoryService,
    conversationRegistryService,
    type FinalTurnSource,
    isChatMemoryContextEligibleRequest,
    isChatMemoryWriteEligibleRequest,
    type ThreadMemoryStatusEvent,
} from './chat-memory'
import { buildSystemMessages, createChatSession, getTrustedUserUrlCatalogSystemPrompt, withChatMemoryContextMessages } from './chat-session'
import { prepareComposerContextInvocation, resolveComposerContextInvocation } from './composer-context'
import { startDeliveryChainRun } from './delivery-chain'
import {
    collectSafePublicUserUrls,
    createGeneralReActRunContext,
    GeneralReActAgentRunner,
    MAX_TRUSTED_USER_URLS,
    RetryPermitPool,
} from './general-react-agent'
import { generalReActExecutionGate, type GeneralReActExecutionPermit } from './general-react-agent/execution-gate'
import { logSkillRuntime, normalizeKnownRuntimeError, throwIfAborted } from './stream-errors'
import type { ChatSession, PreparedGeneralChatContext, ResolvedChatExecutionContext, WriteChunk } from './types'
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
    deferCleanup?: (cleanup: () => void | Promise<void>) => void
    isClosed: () => boolean
    request: ChatRequest
    writeChunk: WriteChunk
    writeTerminalChunk?: (chunk: ChatStreamChunk, terminalState: StreamTerminalStateDto) => Promise<void>
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

function getLastUserMessageId(request: ChatRequest) {
    for (let index = request.messages.length - 1; index >= 0; index -= 1) {
        const message = request.messages[index]

        if (message.role !== 'user') {
            continue
        }

        return message.id
    }

    return undefined
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
    private readonly deferCleanup?: ChatOrchestratorOptions['deferCleanup']
    private readonly isClosed: () => boolean
    private readonly request: ChatRequest
    private readonly writeChunk: WriteChunk
    private readonly writeTerminalChunk?: ChatOrchestratorOptions['writeTerminalChunk']
    private readonly assistantMessageId = createId()
    private chatContextPreflight: ChatContextPreflight | null = null
    private threadMemoryStatusActive = false
    private userMemoryContextMessages: BaseMessage[] = []
    private modelHandle: AiMindChatModelHandle | null = null

    constructor(options: ChatOrchestratorOptions) {
        this.context = options.context
        this.deferCleanup = options.deferCleanup
        this.isClosed = options.isClosed
        this.request = options.request
        this.writeChunk = options.writeChunk
        this.writeTerminalChunk = options.writeTerminalChunk
    }

    private shouldEmitReasoning() {
        return this.request.options?.enableReasoning !== false
    }

    private writeThreadMemoryStatus(event: ThreadMemoryStatusEvent) {
        if (event.status === 'started') {
            this.threadMemoryStatusActive = true
        } else {
            this.threadMemoryStatusActive = false
        }

        this.writeChunk({
            type: 'thread-memory-status',
            status: event.status,
            message: event.message,
            ...(typeof event.summaryLength === 'number' ? { summaryLength: event.summaryLength } : {}),
            ...(typeof event.pinnedDecisionCount === 'number' ? { pinnedDecisionCount: event.pinnedDecisionCount } : {}),
        })
    }

    private finishActiveThreadMemoryStatus() {
        if (!this.threadMemoryStatusActive) {
            return
        }

        this.writeThreadMemoryStatus({
            status: 'failed',
            message: '上下文自动压缩已结束',
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

    /**
     * completed terminal 已经 durable-project 后，Memory 属于可降级的后置副作用。
     * 它不能继续占住 Run 的 execution owner；真正的底层 I/O 取消由 Memory
     * service 的 signal 契约负责，这里只保证 orchestration 不等待迟到工作。
     */
    private async runPostTerminalMemorySideEffect(
        stage: 'append-turn' | 'touch-conversation',
        operation: () => Promise<unknown>
    ): Promise<'aborted' | 'completed' | 'failed'> {
        const signal = this.context.signal

        if (signal?.aborted) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'post-terminal-side-effect-aborted',
                stage,
            })
            return 'aborted'
        }

        const operationResult = Promise.resolve()
            .then(operation)
            .then(
                () => 'completed' as const,
                error => {
                    // 即使取消已先结束 orchestration，也要消费迟到 rejection，避免它变成未处理的 Promise。
                    logSkillRuntime('chat-memory-append-failed', {
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                        stage,
                    })
                    return 'failed' as const
                }
            )

        if (!signal) {
            return operationResult
        }

        let removeAbortListener: (() => void) | undefined
        const aborted = new Promise<'aborted'>(resolve => {
            const onAbort = () => resolve('aborted')

            signal.addEventListener('abort', onAbort, { once: true })
            removeAbortListener = () => signal.removeEventListener('abort', onAbort)
        })

        if (signal.aborted) {
            removeAbortListener()
            return 'aborted'
        }

        const result = await Promise.race([operationResult, aborted])
        removeAbortListener()

        if (result === 'aborted') {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'post-terminal-side-effect-aborted',
                stage,
            })
        }

        return result
    }

    private async appendCompletedChatMemoryTurn(
        assistantText: string | undefined,
        source: FinalTurnSource = 'chat',
        memoryWriteEligible = true
    ) {
        if (!memoryWriteEligible) {
            logSkillRuntime('chat-memory-append-skipped', {
                reason: 'run-not-memory-write-eligible',
                source,
            })
            return
        }

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
        const userMessageId = getLastUserMessageId(this.request)

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

        const appendResult = await this.runPostTerminalMemorySideEffect('append-turn', () =>
            chatMemoryService.appendCompletedTurn(
                threadId,
                {
                    assistantMessageId: this.assistantMessageId,
                    assistantText: normalizedAssistantText,
                    source,
                    ...(userMessageId ? { userMessageId } : {}),
                    userText,
                },
                {
                    promotionContext: {
                        sessionId: this.context.sessionId!,
                        sourceConversationId,
                    },
                    signal: this.context.signal,
                }
            )
        )

        if (appendResult === 'aborted') {
            return
        }

        const touchResult = await this.runPostTerminalMemorySideEffect('touch-conversation', () =>
            conversationRegistryService.touchConversation(this.context.sessionId!, sourceConversationId, {
                hasMessages: true,
            })
        )

        if (touchResult === 'aborted' || this.context.signal?.aborted) {
            return
        }

        void this.enqueueCompletedUserMemoryExtraction({
            assistantText: normalizedAssistantText,
            source,
            userText,
        })
    }

    private async enqueueCompletedUserMemoryExtraction(input: { assistantText: string; source: FinalTurnSource; userText: string }) {
        try {
            if (!this.context.sessionId || this.context.signal?.aborted) {
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
                    const threadState = await chatMemoryService.readThreadState(threadId, { signal: this.context.signal })

                    if (this.context.signal?.aborted) {
                        return
                    }

                    safeShortTermContext = {
                        pinnedDecisions: threadState.state.pinnedDecisions,
                        summary: threadState.state.summary,
                    }
                }
            } catch {
                safeShortTermContext = undefined
            }

            if (this.context.signal?.aborted) {
                return
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

    private async resolveUserMemoryContextMessages(path: 'ordinary_chat' | 'tool_assisted_ordinary_chat') {
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
                path,
                sessionId: this.context.sessionId,
            })

            return buildUserMemoryContextMessages(selectedUserMemories)
        } catch {
            return []
        }
    }

    private async prepareChatContextMessages(
        messages: BaseMessage[],
        includeUserMemory: boolean,
        nonMessagePayloads: unknown[] = []
    ): Promise<BaseMessage[]> {
        const preflight = this.chatContextPreflight
        const userMemoryMessages = includeUserMemory ? this.userMemoryContextMessages : []

        if (!preflight) {
            return withChatMemoryContextMessages(messages, userMemoryMessages)
        }

        const prepared = await preflight.prepare(
            memoryMessages => withChatMemoryContextMessages(messages, [...userMemoryMessages, ...memoryMessages]),
            nonMessagePayloads
        )

        return prepared.messages
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
        const runId = this.context.streamRecovery?.runId ?? skeletonResult.runId

        logSkillRuntime('version-plan-tasklist-agent-skeleton', {
            runId,
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

        const agentRunResult = await startVersionPlanTasklistAgentRun({
            assistantMessageId: this.assistantMessageId,
            context: this.context,
            conversationId: this.request.conversationId,
            modelId: this.context.resolvedModelSelection.modelId,
            modelProvider: this.context.resolvedModelSelection.provider,
            models,
            reasoningEnabled: this.shouldEmitReasoning(),
            runId,
            runtimeConfig,
            sessionId,
            userGoal,
            versionPlanReference: skeletonResult.versionPlanReference,
            writeChunk: this.writeChunk,
        })

        return agentRunResult.graphResult.status === 'interrupted' ? 'interrupted' : true
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

    private async prepareGeneralChatContext(): Promise<PreparedGeneralChatContext> {
        const messages: BaseMessage[] = []

        const composerInvocation = resolveComposerContextInvocation(this.request)
        if (composerInvocation) {
            const preparedComposerContext = await prepareComposerContextInvocation(composerInvocation, {
                context: this.context,
                writeChunk: this.writeChunk,
            })
            messages.push(...preparedComposerContext.messages)
        }

        return {
            messages,
            nonMessagePayloads: [],
        }
    }

    private async resolveTrustedUserUrls(): Promise<string[]> {
        const threadId = isChatMemoryContextEligibleRequest(this.request) ? this.resolveConversationThreadId() : null
        if (!threadId) {
            return []
        }

        try {
            const { state } = await chatMemoryService.readThreadState(threadId, { signal: this.context.signal })
            const urls = new Set<string>()

            for (const message of [...state.messages].reverse()) {
                if (message.role !== 'user') {
                    continue
                }

                for (const url of collectSafePublicUserUrls(message.text)) {
                    urls.add(url)
                    if (urls.size >= MAX_TRUSTED_USER_URLS) {
                        return [...urls]
                    }
                }
            }

            return [...urls]
        } catch (error) {
            if (isAbortError(error) || this.context.signal?.aborted) {
                throw error
            }

            return []
        }
    }

    private async runGeneralReActEntryStage(
        session: ChatSession,
        preparedContext: PreparedGeneralChatContext = { messages: [], nonMessagePayloads: [] }
    ) {
        const trustedUserUrls = await this.resolveTrustedUserUrls()
        const loopSystemMessages = buildSystemMessages(...session.loopSystemPrompts, getTrustedUserUrlCatalogSystemPrompt(trustedUserUrls))
        const finalizerSystemMessages = buildSystemMessages(...session.finalizerSystemPrompts)
        const preparedMessages = await this.prepareChatContextMessages(
            [...loopSystemMessages, ...preparedContext.messages, ...session.langChainMessages],
            true,
            [...preparedContext.nonMessagePayloads, ...session.activeTools.map(toolDefinition => convertToOpenAITool(toolDefinition.tool))]
        )
        const runContext = createGeneralReActRunContext({
            clock: { now: () => Date.now() },
            createPhaseModel: session.createPhaseModel,
            executionContext: this.context,
            isTransportClosed: this.isClosed,
            normalizeModelError: session.modelHandle.normalizeError,
            publishChunk: async chunk => {
                await this.writeChunk(chunk)
            },
            retryPermitPool: new RetryPermitPool(),
            runSignal: this.context.signal ?? new AbortController().signal,
            selectedSkill: session.skillDefinition
                ? {
                      description: session.skillDefinition.description,
                      name: session.skillDefinition.name,
                      skillId: session.skillDefinition.skillId,
                  }
                : undefined,
            trustedUserUrls,
            toolDefinitionMap: session.activeToolDefinitionMap,
        })

        return new GeneralReActAgentRunner().run({
            finalizerMessages: [...finalizerSystemMessages, ...preparedMessages.slice(loopSystemMessages.length)],
            context: runContext,
            messages: preparedMessages,
            runId: this.context.streamRecovery?.runId ?? this.assistantMessageId,
            threadId: this.resolveConversationThreadId() ?? this.assistantMessageId,
        })
    }

    private async emitCompletedGeneralReActTerminal(lifecycle: StreamLifecycle) {
        if (this.context.signal?.aborted || this.isClosed()) {
            return false
        }

        if (this.writeTerminalChunk) {
            await this.writeTerminalChunk({ type: 'finish' }, 'completed')
            return true
        }

        // 直接构造 Orchestrator 的测试与非 resumable 调用仍沿用既有 lifecycle。
        // 生产 ChatService 始终提供可等待的 durable terminal writer。
        return lifecycle.emitFinishIfOpen()
    }

    async run() {
        const lifecycle = new StreamLifecycle({
            context: this.context,
            isClosed: this.isClosed,
            writeChunk: this.writeChunk,
        })
        let generalReActPermit: GeneralReActExecutionPermit | null = null

        try {
            // 先发 start，让前端立即创建 assistant 占位。
            // createChatSession 会解析 Skill 提示词和固定 General Tool Policy；
            // 如果等这些前置准备完成再发首包，用户会看到“按钮已禁用但消息区空白”的假死状态。
            lifecycle.emitStartOnce(this.assistantMessageId)

            const routeType = this.context.resolvedModelSelection.routeType
            const commandName = this.request.composer?.command?.name
            const isDedicatedRoute = routeType !== 'chat' || commandName === 'tasklist' || commandName === 'delivery-chain'

            if (!isDedicatedRoute) {
                generalReActPermit = generalReActExecutionGate.tryAcquire()

                if (!generalReActPermit) {
                    lifecycle.emitRuntimeErrorOnce({
                        errorCode: 'STREAM_SERVICE_UNAVAILABLE',
                        message: '服务繁忙，请稍后重试。',
                        retryable: true,
                    })
                    return
                }

                if (this.deferCleanup) {
                    const permit = generalReActPermit
                    this.deferCleanup(() => permit.release())
                    generalReActPermit = null
                }
            }

            const session = await createChatSession(this.request, this.context.resolvedModelSelection)

            this.modelHandle = session.modelHandle
            const chatMemoryThreadId = isChatMemoryContextEligibleRequest(this.request) ? this.resolveConversationThreadId() : null
            const sourceConversationId = chatMemoryThreadId && this.context.sessionId ? this.resolveValidatedConversationId() : null
            this.chatContextPreflight = createChatContextPreflight({
                onStatus: event => this.writeThreadMemoryStatus(event),
                promotionContext:
                    sourceConversationId && this.context.sessionId
                        ? {
                              sessionId: this.context.sessionId,
                              sourceConversationId,
                          }
                        : undefined,
                resolvedModelSelection: this.context.resolvedModelSelection,
                signal: this.context.signal,
                threadId: chatMemoryThreadId,
            })
            this.userMemoryContextMessages = isUserMemoryContextEligibleRequest(this.request)
                ? await this.resolveUserMemoryContextMessages(
                      session.activeTools.length > 0 ? 'tool_assisted_ordinary_chat' : 'ordinary_chat'
                  )
                : []

            throwIfAborted(this.context.signal)

            logSkillRuntime('request-start', {
                requestedSkill: this.request.options?.skill ?? null,
                resolvedSkill: session.skillDefinition?.skillId ?? null,
                activeTools: session.activeToolNames,
            })

            // 主链路优先级从“最具体”到“最通用”：专用 Tasklist / Delivery / Image route
            // 由各自 runtime 接管，其他聊天统一准备上下文后进入 General ReAct Runner。
            const tasklistAgentResult = await this.runVersionPlanTasklistAgentEntryStage(session)

            if (tasklistAgentResult) {
                if (tasklistAgentResult !== 'interrupted') {
                    lifecycle.emitFinishIfOpen()
                }
                return
            }

            if (await this.runDeliveryChainEntryStage(session)) {
                lifecycle.emitFinishIfOpen()
                return
            }

            const preparedContext = await this.prepareGeneralChatContext()
            const agentResult = await this.runGeneralReActEntryStage(session, preparedContext)
            this.finishActiveThreadMemoryStatus()
            const terminalProjected = await this.emitCompletedGeneralReActTerminal(lifecycle)

            if (terminalProjected) {
                await this.appendCompletedChatMemoryTurn(agentResult.assistantText, agentResult.source, agentResult.memoryWriteEligible)
            }
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
        } finally {
            generalReActPermit?.release()
            this.finishActiveThreadMemoryStatus()
        }
    }
}
