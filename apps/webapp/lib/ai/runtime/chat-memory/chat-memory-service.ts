import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph'

import { getChatMemoryCheckpointer } from './checkpointer-provider'
import { type ChatMemoryCompactionGenerator, compactThreadState } from './compaction'
import { adaptFinalTurnCandidate, type FinalTurnCompletionStatus, type FinalTurnSource, hasDuplicateFinalTurn } from './final-turn-adapter'
import { createChatThreadMessage } from './message-adapter'
import { type ChatMemoryRuntimeConfig, getChatMemoryRuntimeConfig } from './runtime-config'
import {
    type AiMindThreadState,
    CHAT_MEMORY_RECENT_MESSAGE_LIMIT,
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

function toBoundedThreadState(state: AiMindThreadState): AiMindThreadState {
    if (state.messages.length <= CHAT_MEMORY_RECENT_MESSAGE_LIMIT) {
        return normalizeThreadState(state)
    }

    return normalizeThreadState({
        ...state,
        messages: state.messages.slice(-CHAT_MEMORY_RECENT_MESSAGE_LIMIT),
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
}

export interface ChatMemoryService {
    appendCompletedTurn(threadId: string, input: AppendCompletedTurnInput, options?: AppendCompletedTurnOptions): Promise<void>
    readThreadState(threadId: string): Promise<ChatMemoryReadResult>
    writeThreadState(threadId: string, state: AiMindThreadState): Promise<void>
}

interface CreateChatMemoryServiceOptions {
    compactionGenerator?: ChatMemoryCompactionGenerator
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

    const getConfig = (threadId: string) => ({
        configurable: {
            thread_id: threadId,
        },
        durability: 'sync' as const,
    })

    const readCheckpointState = async (threadId: string) => {
        if (!graph) {
            logChatMemoryServiceEvent('read-skipped-disabled', {
                threadId,
            })
            return createEmptyThreadState()
        }

        const snapshot = await graph.getState(getConfig(threadId))

        return normalizeCheckpointThreadState(snapshot.values)
    }

    return {
        async readThreadState(threadId) {
            if (!graph) {
                return {
                    restored: false,
                    state: createEmptyThreadState(),
                }
            }

            const checkpointState = await readCheckpointState(threadId)
            const state = toBoundedThreadState(checkpointState)
            const restored = !isEmptyState(checkpointState)

            logChatMemoryServiceEvent('read-succeeded', {
                messageCount: state.messages.length,
                pinnedDecisionCount: state.pinnedDecisions.length,
                rawMessageCount: checkpointState.messages.length,
                restored,
                summaryLength: state.summary.length,
                threadId,
            })

            return {
                restored,
                state,
            }
        },

        async writeThreadState(threadId, state) {
            if (!graph) {
                return
            }

            await graph.invoke(normalizeThreadState(state), getConfig(threadId))
        },

        async appendCompletedTurn(threadId, input, appendOptions = {}) {
            const candidate = adaptFinalTurnCandidate(input)

            if (!candidate || !graph) {
                logChatMemoryServiceEvent('append-skipped', {
                    assistantTextLength: typeof input.assistantText === 'string' ? input.assistantText.trim().length : 0,
                    hasGraph: Boolean(graph),
                    source: input.source ?? 'chat',
                    threadId,
                    userTextLength: typeof input.userText === 'string' ? input.userText.trim().length : 0,
                })
                return
            }

            const state = await readCheckpointState(threadId)

            if (hasDuplicateFinalTurn(state.messages, candidate)) {
                logChatMemoryServiceEvent('append-skipped-duplicate', {
                    assistantMessageId: candidate.assistantMessageId ?? null,
                    source: candidate.source,
                    threadId,
                    userMessageId: candidate.userMessageId ?? null,
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
                    threadId,
                    userTextLength: candidate.userText.length,
                })
                return
            }

            const messages = [...state.messages, userMessage, assistantMessage]
            const nextState = {
                ...state,
                messages,
            }

            if (messages.length > CHAT_MEMORY_RECENT_MESSAGE_LIMIT) {
                appendOptions.onStatus?.({
                    status: 'started',
                    message: '自动压缩上下文中',
                })

                try {
                    const compactedState = await compactThreadState(nextState, options.compactionGenerator)

                    if (!compactedState) {
                        appendOptions.onStatus?.({
                            status: 'failed',
                            message: '上下文自动压缩失败',
                        })
                        logChatMemoryServiceEvent('compaction-write-skipped', {
                            messageCount: messages.length,
                            threadId,
                        })
                        return
                    }

                    await this.writeThreadState(threadId, compactedState)
                    appendOptions.onStatus?.({
                        status: 'succeeded',
                        message: '上下文已自动压缩',
                        pinnedDecisionCount: compactedState.pinnedDecisions.length,
                        summaryLength: compactedState.summary.length,
                    })
                    logChatMemoryServiceEvent('compaction-write-succeeded', {
                        messageCount: compactedState.messages.length,
                        pinnedDecisionCount: compactedState.pinnedDecisions.length,
                        summaryLength: compactedState.summary.length,
                        threadId,
                    })
                    return
                } catch (error) {
                    appendOptions.onStatus?.({
                        status: 'failed',
                        message: '上下文自动压缩失败',
                    })
                    throw error
                }
            }

            await this.writeThreadState(threadId, nextState)
            logChatMemoryServiceEvent('append-write-succeeded', {
                messageCount: nextState.messages.length,
                source: candidate.source,
                threadId,
            })
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
    readThreadState(threadId) {
        return getChatMemoryService().readThreadState(threadId)
    },
    writeThreadState(threadId, state) {
        return getChatMemoryService().writeThreadState(threadId, state)
    },
}
