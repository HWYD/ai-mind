import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph'

import { isAbortError, throwIfAborted } from '@/lib/ai/error-utils'
import type { ContextBudget } from '@/lib/ai/model-provider'

import { type UserMemoryService, userMemoryService } from '../user-memory'
import { getChatMemoryCheckpointer } from './checkpointer-provider'
import {
    type ChatMemoryCompactionGenerator,
    type ChatMemoryCompactionResult,
    compactThreadStateWithResult,
    estimateChatMemoryTokens,
} from './compaction'
import { adaptFinalTurnCandidate, type FinalTurnCompletionStatus, type FinalTurnSource, hasDuplicateFinalTurn } from './final-turn-adapter'
import { createChatThreadMessage } from './message-adapter'
import { type ChatMemoryRuntimeConfig, getChatMemoryRuntimeConfig } from './runtime-config'
import {
    type AiMindThreadState,
    type ChatThreadMessage,
    createEmptyThreadState,
    normalizeCheckpointThreadState,
    normalizeThreadState,
} from './state-schema'

const replaceValue = <T>(_left: T, right: T): T => right

function logChatMemoryServiceEvent(event: string, meta: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info('[chat-memory-service]', JSON.stringify({ event, ...meta }))
}

const ChatMemoryStateAnnotation = Annotation.Root({
    messages: Annotation<ChatThreadMessage[], ChatThreadMessage[]>({
        default: () => [],
        reducer: replaceValue,
    }),
    summary: Annotation<string, string>({
        default: () => '',
        reducer: replaceValue,
    }),
    pinnedDecisions: Annotation<string[], string[]>({
        default: () => [],
        reducer: replaceValue,
    }),
    lastCompactedAt: Annotation<string | undefined, string | undefined>({
        reducer: replaceValue,
    }),
})

type ChatMemoryState = typeof ChatMemoryStateAnnotation.State

function createChatMemoryGraph(checkpointer: BaseCheckpointSaver) {
    return new StateGraph(ChatMemoryStateAnnotation)
        .addNode('save', (state: ChatMemoryState) => normalizeThreadState(state))
        .addEdge(START, 'save')
        .addEdge('save', END)
        .compile({
            checkpointer,
            name: 'ai-mind-chat-memory',
        })
}

function isEmptyState(state: AiMindThreadState): boolean {
    return state.messages.length === 0 && state.pinnedDecisions.length === 0 && state.summary.trim().length === 0
}

function awaitWithAbortSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    throwIfAborted(signal)

    if (!signal) {
        return operation
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort)
            reject(new DOMException('Request aborted', 'AbortError'))
        }

        signal.addEventListener('abort', onAbort, { once: true })
        operation.then(
            value => {
                signal.removeEventListener('abort', onAbort)
                resolve(value)
            },
            error => {
                signal.removeEventListener('abort', onAbort)
                reject(error)
            }
        )
    })
}

export interface ChatMemoryReadResult {
    restored: boolean
    state: AiMindThreadState
}

export interface AppendCompletedTurnInput {
    assistantMessageId?: string
    assistantText: string
    completionStatus?: FinalTurnCompletionStatus
    source?: FinalTurnSource
    userMessageId?: string
    userText: string
}

export type ThreadMemoryStatus = 'failed' | 'started' | 'succeeded'

export interface ThreadMemoryStatusEvent {
    status: ThreadMemoryStatus
    message: string
    summaryLength?: number
    pinnedDecisionCount?: number
}

export interface AppendCompletedTurnOptions {
    onStatus?: (event: ThreadMemoryStatusEvent) => void
    promotionContext?: {
        sessionId: string
        sourceConversationId: string
    }
    signal?: AbortSignal
}

export interface ChatMemoryReadOptions {
    signal?: AbortSignal
}

export interface ChatMemoryWriteOptions {
    signal?: AbortSignal
}

export interface CompactThreadStateOptions {
    force?: boolean
    onStatus?: (event: ThreadMemoryStatusEvent) => void
    promotionContext?: {
        sessionId: string
        sourceConversationId: string
    }
    signal?: AbortSignal
}

export interface ChatMemoryService {
    appendCompletedTurn(threadId: string, input: AppendCompletedTurnInput, options?: AppendCompletedTurnOptions): Promise<void>
    compactThreadState(
        threadId: string,
        budget: ContextBudget,
        options?: CompactThreadStateOptions
    ): Promise<ChatMemoryCompactionResult | null>
    deleteThreadState(threadId: string, options?: ChatMemoryWriteOptions): Promise<void>
    readThreadState(threadId: string, options?: ChatMemoryReadOptions): Promise<ChatMemoryReadResult>
    writeThreadState(threadId: string, state: AiMindThreadState, options?: ChatMemoryWriteOptions): Promise<void>
}

interface CreateChatMemoryServiceOptions {
    compactionGenerator?: ChatMemoryCompactionGenerator
    userMemoryService?: Pick<UserMemoryService, 'promotePinnedDecisionDiff'>
}

let sharedChatMemoryService: ChatMemoryService | undefined
let sharedChatMemoryServiceKey: string | undefined

function buildChatMemoryServiceKey(config: ChatMemoryRuntimeConfig, env: Record<string, string | undefined>): string {
    return [config.checkpointMode, env.NODE_ENV ?? '', env.DATABASE_URL?.trim() ?? ''].join('|')
}

export function createChatMemoryService(
    config: ChatMemoryRuntimeConfig = getChatMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateChatMemoryServiceOptions = {}
): ChatMemoryService {
    const checkpointer = getChatMemoryCheckpointer(config.checkpointMode, env)
    const graph = checkpointer ? createChatMemoryGraph(checkpointer) : null
    const pinnedDecisionPromotionService = options.userMemoryService ?? userMemoryService
    const writeQueueByThread = new Map<string, Promise<void>>()

    const getConfig = (threadId: string, signal?: AbortSignal) => ({
        configurable: {
            thread_id: threadId,
        },
        durability: 'sync' as const,
        ...(signal ? { signal } : {}),
    })

    const readCheckpointState = async (threadId: string, signal?: AbortSignal) => {
        if (!graph) {
            logChatMemoryServiceEvent('read-skipped-disabled', {})
            return createEmptyThreadState()
        }

        throwIfAborted(signal)
        const snapshot = await graph.getState(getConfig(threadId, signal))
        throwIfAborted(signal)

        return normalizeCheckpointThreadState(snapshot.values)
    }

    const writeCheckpointState = async (threadId: string, state: AiMindThreadState, signal?: AbortSignal) => {
        if (!graph) {
            return
        }

        throwIfAborted(signal)
        await graph.invoke(normalizeThreadState(state), getConfig(threadId, signal))
        throwIfAborted(signal)
    }

    const serializeThreadWrite = <T>(threadId: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
        const previous = writeQueueByThread.get(threadId) ?? Promise.resolve()
        const result = previous.then(operation, operation)
        const completion = result.then(
            () => undefined,
            () => undefined
        )

        writeQueueByThread.set(threadId, completion)
        void completion.then(() => {
            if (writeQueueByThread.get(threadId) === completion) {
                writeQueueByThread.delete(threadId)
            }
        })

        return awaitWithAbortSignal(result, signal)
    }

    return {
        async deleteThreadState(threadId, deleteOptions = {}) {
            if (!checkpointer) {
                return
            }

            const deleteThread = (checkpointer as BaseCheckpointSaver & { deleteThread?: (id: string) => Promise<void> }).deleteThread

            if (!deleteThread) {
                throw new Error('The configured chat memory checkpointer does not support thread deletion.')
            }

            throwIfAborted(deleteOptions.signal)
            await deleteThread.call(checkpointer, threadId)
            throwIfAborted(deleteOptions.signal)
        },

        async readThreadState(threadId, readOptions = {}) {
            if (!graph) {
                return {
                    restored: false,
                    state: createEmptyThreadState(),
                }
            }

            const checkpointState = await readCheckpointState(threadId, readOptions.signal)
            const state = normalizeThreadState(checkpointState)
            const restored = !isEmptyState(checkpointState)

            logChatMemoryServiceEvent('read-succeeded', {
                messageCount: state.messages.length,
                pinnedDecisionCount: state.pinnedDecisions.length,
                rawMessageCount: checkpointState.messages.length,
                restored,
                summaryLength: state.summary.length,
            })

            return {
                restored,
                state,
            }
        },

        async writeThreadState(threadId, state, writeOptions = {}) {
            await writeCheckpointState(threadId, state, writeOptions.signal)
        },

        async compactThreadState(threadId, budget, compactOptions = {}) {
            if (!graph) {
                return null
            }

            return serializeThreadWrite(
                threadId,
                async () => {
                    throwIfAborted(compactOptions.signal)
                    const state = await readCheckpointState(threadId, compactOptions.signal)
                    throwIfAborted(compactOptions.signal)

                    if (!compactOptions.force && estimateChatMemoryTokens(state) < budget.compactionTriggerTokens) {
                        return null
                    }

                    compactOptions.onStatus?.({
                        status: 'started',
                        message: '自动压缩上下文中',
                    })

                    let compactionResult: ChatMemoryCompactionResult | null

                    try {
                        compactionResult = await compactThreadStateWithResult(state, budget, options.compactionGenerator, {
                            force: compactOptions.force,
                            signal: compactOptions.signal,
                        })
                        throwIfAborted(compactOptions.signal)
                    } catch (error) {
                        compactOptions.onStatus?.({
                            status: 'failed',
                            message: isAbortError(error) || compactOptions.signal?.aborted ? '上下文自动压缩已取消' : '上下文自动压缩失败',
                        })
                        if (compactOptions.signal?.aborted) {
                            throwIfAborted(compactOptions.signal)
                        }
                        throw error
                    }

                    if (!compactionResult?.wasCompacted) {
                        compactOptions.onStatus?.({
                            status: 'failed',
                            message: '上下文自动压缩失败',
                        })
                        logChatMemoryServiceEvent('compaction-write-skipped', {})
                        return null
                    }

                    try {
                        throwIfAborted(compactOptions.signal)
                        await this.writeThreadState(threadId, compactionResult.state, { signal: compactOptions.signal })
                    } catch (error) {
                        compactOptions.onStatus?.({
                            status: 'failed',
                            message: isAbortError(error) || compactOptions.signal?.aborted ? '上下文自动压缩已取消' : '上下文自动压缩失败',
                        })
                        if (compactOptions.signal?.aborted) {
                            throwIfAborted(compactOptions.signal)
                        }
                        throw error
                    }

                    compactOptions.onStatus?.({
                        status: 'succeeded',
                        message: '上下文已自动压缩',
                        pinnedDecisionCount: compactionResult.state.pinnedDecisions.length,
                        summaryLength: compactionResult.state.summary.length,
                    })
                    logChatMemoryServiceEvent('compaction-write-succeeded', {
                        messageCount: compactionResult.state.messages.length,
                        pinnedDecisionCount: compactionResult.state.pinnedDecisions.length,
                        summaryLength: compactionResult.state.summary.length,
                    })

                    const promotionContext = compactOptions.promotionContext

                    if (promotionContext?.sessionId && promotionContext.sourceConversationId) {
                        try {
                            await pinnedDecisionPromotionService.promotePinnedDecisionDiff({
                                nextPinnedDecisions: compactionResult.nextPinnedDecisions,
                                previousPinnedDecisions: compactionResult.previousPinnedDecisions,
                                sessionId: promotionContext.sessionId,
                                sourceConversationId: promotionContext.sourceConversationId,
                            })
                        } catch (error) {
                            logChatMemoryServiceEvent('pinned-decision-promotion-failed', {
                                errorName: error instanceof Error ? error.name : 'UnknownError',
                            })
                        }
                    }

                    return compactionResult
                },
                compactOptions.signal
            )
        },

        async appendCompletedTurn(threadId, input, appendOptions = {}) {
            return serializeThreadWrite(
                threadId,
                async () => {
                    throwIfAborted(appendOptions.signal)
                    const candidate = adaptFinalTurnCandidate(input)

                    if (!candidate || !graph) {
                        logChatMemoryServiceEvent('append-skipped', {
                            assistantTextLength: typeof input.assistantText === 'string' ? input.assistantText.trim().length : 0,
                            hasGraph: Boolean(graph),
                            source: input.source ?? 'chat',
                            userTextLength: typeof input.userText === 'string' ? input.userText.trim().length : 0,
                        })
                        return
                    }

                    const state = await readCheckpointState(threadId, appendOptions.signal)

                    if (hasDuplicateFinalTurn(state.messages, candidate)) {
                        logChatMemoryServiceEvent('append-skipped-duplicate', {
                            source: candidate.source,
                        })
                        return
                    }

                    const userMessage = createChatThreadMessage('user', candidate.userText, candidate.userMessageId)
                    const assistantMessage = createChatThreadMessage('assistant', candidate.assistantText, candidate.assistantMessageId)

                    if (!userMessage || !assistantMessage) {
                        logChatMemoryServiceEvent('append-skipped', {
                            assistantTextLength: candidate.assistantText.length,
                            hasGraph: Boolean(graph),
                            source: candidate.source,
                            userTextLength: candidate.userText.length,
                        })
                        return
                    }

                    const messages = [...state.messages, userMessage, assistantMessage]
                    const nextState = {
                        ...state,
                        messages,
                    }

                    try {
                        await this.writeThreadState(threadId, nextState, { signal: appendOptions.signal })
                    } catch (error) {
                        if (isAbortError(error) || appendOptions.signal?.aborted) {
                            throw error
                        }
                        logChatMemoryServiceEvent('raw-append-failed', {
                            errorName: error instanceof Error ? error.name : 'UnknownError',
                        })
                        return
                    }
                    logChatMemoryServiceEvent('append-write-succeeded', {
                        messageCount: nextState.messages.length,
                        source: candidate.source,
                    })
                },
                appendOptions.signal
            )
        },
    }
}

export function getChatMemoryService(
    config: ChatMemoryRuntimeConfig = getChatMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateChatMemoryServiceOptions = {}
): ChatMemoryService {
    const serviceKey = buildChatMemoryServiceKey(config, env)

    if (!sharedChatMemoryService || sharedChatMemoryServiceKey !== serviceKey) {
        sharedChatMemoryService = createChatMemoryService(config, env, options)
        sharedChatMemoryServiceKey = serviceKey
    }

    return sharedChatMemoryService
}

export const chatMemoryService: ChatMemoryService = {
    appendCompletedTurn(threadId, input, options) {
        return getChatMemoryService().appendCompletedTurn(threadId, input, options)
    },
    compactThreadState(threadId, budget, options) {
        return getChatMemoryService().compactThreadState(threadId, budget, options)
    },
    deleteThreadState(threadId, options) {
        return getChatMemoryService().deleteThreadState(threadId, options)
    },
    readThreadState(threadId, options) {
        return getChatMemoryService().readThreadState(threadId, options)
    },
    writeThreadState(threadId, state, options) {
        return getChatMemoryService().writeThreadState(threadId, state, options)
    },
}
