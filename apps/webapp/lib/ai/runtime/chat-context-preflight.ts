import type { BaseMessage } from '@langchain/core/messages'

import { isAbortError, throwIfAborted } from '@/lib/ai/error-utils'
import {
    type ContextBudget,
    deriveContextBudget,
    estimateModelInputTokens,
    getModelProviderConfig,
    InputLengthExceededError,
    type ResolvedModelSelection,
} from '@/lib/ai/model-provider'

import {
    type AiMindThreadState,
    buildChatMemoryContextMessages,
    type ChatMemoryService,
    chatMemoryService,
    createEmptyThreadState,
    fitChatMemoryContextMessages,
    type ThreadMemoryStatusEvent,
} from './chat-memory'

export type ChatContextPreparationKind = 'ephemeral-fit' | 'persistent-compaction' | 'ready'

export interface PreparedChatContext {
    budget: ContextBudget
    estimatedTokens: number
    kind: ChatContextPreparationKind
    messages: BaseMessage[]
}

export interface CreateChatContextPreflightOptions {
    memoryService?: Pick<ChatMemoryService, 'compactThreadState' | 'readThreadState'>
    onStatus?: (event: ThreadMemoryStatusEvent) => void
    promotionContext?: {
        sessionId: string
        sourceConversationId: string
    }
    resolvedModelSelection: ResolvedModelSelection
    signal?: AbortSignal
    threadId?: string | null
}

function deriveBudget(resolvedModelSelection: ResolvedModelSelection): ContextBudget {
    const config = getModelProviderConfig()
    const environment = resolvedModelSelection.provider === 'ollama' ? 'ollama' : 'cloud'

    return deriveContextBudget({
        environment,
        maxOutputTokens: config.chatMaxOutputTokens,
        operationalCapTokens: environment === 'ollama' ? config.ollamaContextTokens : config.operationalContextCapTokens,
        physicalWindowTokens: resolvedModelSelection.catalogItem.contextWindowTokens,
    })
}

function throwNonMemoryOverflow(budget: ContextBudget, actualTokens: number): never {
    // 复用既有错误类型和 stream error mapping，字段名维持兼容；此路径的数值单位为 token。
    throw new InputLengthExceededError(budget.hardInputTokens, actualTokens)
}

function logChatContextPreflightEvent(event: string, meta: Record<string, boolean | number | string>): void {
    // 只保留预算数字和稳定枚举；不得把 prompt、memory、tool payload 写入日志。
    // eslint-disable-next-line no-console
    console.info('[chat-context-preflight]', JSON.stringify({ event, ...meta }))
}

export interface ChatContextPreflight {
    prepare(assemble: (memoryMessages: BaseMessage[]) => BaseMessage[], nonMessagePayloads?: unknown[]): Promise<PreparedChatContext>
}

class ChatContextPreflightImpl implements ChatContextPreflight {
    private readonly budget: ContextBudget
    private readonly memoryService: Pick<ChatMemoryService, 'compactThreadState' | 'readThreadState'>
    private memoryState: AiMindThreadState | undefined
    private persistentCompactionAttempted = false

    constructor(private readonly options: CreateChatContextPreflightOptions) {
        this.budget = deriveBudget(options.resolvedModelSelection)
        this.memoryService = options.memoryService ?? chatMemoryService
    }

    async prepare(
        assemble: (memoryMessages: BaseMessage[]) => BaseMessage[],
        nonMessagePayloads: unknown[] = []
    ): Promise<PreparedChatContext> {
        throwIfAborted(this.options.signal)
        const nonMemoryMessages = assemble([])
        const nonMemoryTokens = estimateModelInputTokens(nonMemoryMessages, { nonMessagePayloads }).estimatedTokens

        if (nonMemoryTokens > this.budget.hardInputTokens) {
            logChatContextPreflightEvent('prepared', {
                ...this.toBudgetDiagnostics(),
                afterTokens: nonMemoryTokens,
                beforeTokens: nonMemoryTokens,
                fallback: 'non-memory-overflow',
                memoryTokens: 0,
                persistentAttempted: false,
                triggerReason: 'non-memory-overflow',
            })
            return throwNonMemoryOverflow(this.budget, nonMemoryTokens)
        }

        const state = await this.resolveMemoryState()
        throwIfAborted(this.options.signal)
        let memoryMessages = buildChatMemoryContextMessages(state)
        let messages = assemble(memoryMessages)
        let estimatedTokens = estimateModelInputTokens(messages, { nonMessagePayloads }).estimatedTokens
        const initialCompleteInputTokens = estimatedTokens
        let kind: ChatContextPreparationKind = 'ready'
        const memoryTokens = estimateModelInputTokens(memoryMessages).estimatedTokens
        const persistentEligible = memoryTokens >= this.budget.compactionTriggerTokens || estimatedTokens > this.budget.hardInputTokens

        logChatContextPreflightEvent('counted', {
            ...this.toBudgetDiagnostics(),
            completeInputTokens: estimatedTokens,
            memoryTokens,
            triggerReason:
                memoryTokens >= this.budget.compactionTriggerTokens
                    ? 'memory-trigger'
                    : estimatedTokens > this.budget.hardInputTokens
                      ? 'complete-input-overflow'
                      : 'none',
        })

        if (this.options.threadId && !this.persistentCompactionAttempted && persistentEligible) {
            this.persistentCompactionAttempted = true

            try {
                const result = await this.memoryService.compactThreadState(this.options.threadId, this.budget, {
                    force: true,
                    onStatus: this.options.onStatus,
                    promotionContext: this.options.promotionContext,
                    signal: this.options.signal,
                })

                if (result?.wasCompacted) {
                    this.memoryState = result.state
                    memoryMessages = buildChatMemoryContextMessages(result.state)
                    messages = assemble(memoryMessages)
                    estimatedTokens = estimateModelInputTokens(messages, { nonMessagePayloads }).estimatedTokens
                    kind = 'persistent-compaction'
                    logChatContextPreflightEvent('persistent-compaction', {
                        ...this.toBudgetDiagnostics(),
                        afterTokens: estimatedTokens,
                        beforeTokens: initialCompleteInputTokens,
                        fallback: 'none',
                        persistentAttempted: true,
                        triggerReason: 'persisted',
                    })
                } else {
                    logChatContextPreflightEvent('persistent-compaction', {
                        ...this.toBudgetDiagnostics(),
                        afterTokens: estimatedTokens,
                        beforeTokens: initialCompleteInputTokens,
                        fallback: 'ephemeral-fit',
                        persistentAttempted: true,
                        triggerReason: 'candidate-unavailable',
                    })
                }
            } catch (error) {
                if (this.options.signal?.aborted) {
                    throwIfAborted(this.options.signal)
                }

                if (isAbortError(error)) {
                    throw error
                }

                // Chat memory 是可降级能力；候选保存失败后使用原 durable state 做本次只读拟合。
                logChatContextPreflightEvent('persistent-compaction', {
                    ...this.toBudgetDiagnostics(),
                    afterTokens: estimatedTokens,
                    beforeTokens: initialCompleteInputTokens,
                    fallback: 'ephemeral-fit',
                    persistentAttempted: true,
                    triggerReason: 'persistent-write-failed',
                })
            }
        }

        throwIfAborted(this.options.signal)

        if (estimatedTokens <= this.budget.hardInputTokens) {
            logChatContextPreflightEvent('prepared', {
                ...this.toBudgetDiagnostics(),
                afterTokens: estimatedTokens,
                beforeTokens: initialCompleteInputTokens,
                fallback: kind === 'persistent-compaction' ? 'none' : 'ready',
                memoryTokens,
                persistentAttempted: this.persistentCompactionAttempted,
                triggerReason: kind,
            })
            return {
                budget: this.budget,
                estimatedTokens,
                kind,
                messages,
            }
        }

        const projection = fitChatMemoryContextMessages(this.memoryState ?? state, {
            assemble,
            hardInputTokens: this.budget.hardInputTokens,
            nonMessagePayloads,
        })
        messages = assemble(projection.memoryMessages)
        estimatedTokens = estimateModelInputTokens(messages, { nonMessagePayloads }).estimatedTokens

        if (estimatedTokens > this.budget.hardInputTokens) {
            logChatContextPreflightEvent('prepared', {
                ...this.toBudgetDiagnostics(),
                afterTokens: estimatedTokens,
                beforeTokens: initialCompleteInputTokens,
                fallback: 'non-memory-overflow',
                memoryTokens,
                persistentAttempted: this.persistentCompactionAttempted,
                triggerReason: 'ephemeral-fit-failed',
            })
            return throwNonMemoryOverflow(this.budget, estimatedTokens)
        }

        logChatContextPreflightEvent('prepared', {
            ...this.toBudgetDiagnostics(),
            afterTokens: estimatedTokens,
            beforeTokens: initialCompleteInputTokens,
            fallback: 'ephemeral-fit',
            memoryTokens,
            persistentAttempted: this.persistentCompactionAttempted,
            triggerReason: 'ephemeral-fit',
        })

        return {
            budget: this.budget,
            estimatedTokens,
            kind: 'ephemeral-fit',
            messages,
        }
    }

    private async resolveMemoryState(): Promise<AiMindThreadState> {
        if (this.memoryState) {
            return this.memoryState
        }

        if (!this.options.threadId) {
            this.memoryState = createEmptyThreadState()
            return this.memoryState
        }

        try {
            this.memoryState = (await this.memoryService.readThreadState(this.options.threadId, { signal: this.options.signal })).state
        } catch {
            this.memoryState = createEmptyThreadState()
        }

        return this.memoryState
    }

    private toBudgetDiagnostics() {
        return {
            compactionTriggerTokens: this.budget.compactionTriggerTokens,
            effectiveWindowTokens: this.budget.effectiveWindowTokens,
            hardInputTokens: this.budget.hardInputTokens,
            modelId: this.options.resolvedModelSelection.modelId,
            physicalWindowTokens: this.budget.physicalWindowTokens,
            postCompactionTargetTokens: this.budget.postCompactionTargetTokens,
        }
    }
}

export function createChatContextPreflight(options: CreateChatContextPreflightOptions): ChatContextPreflight {
    return new ChatContextPreflightImpl(options)
}
