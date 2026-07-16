import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph'

import { createId } from '@/lib/ai/create-id'

import { getChatMemoryService } from './chat-memory-service'
import { getChatMemoryCheckpointer } from './checkpointer-provider'
import { type ChatMemoryRuntimeConfig, getChatMemoryRuntimeConfig } from './runtime-config'
import {
    CHAT_CONVERSATION_REGISTRY_LIMIT,
    CHAT_CONVERSATION_TITLE_LIMIT,
    type ChatConversation,
    type ConversationListItem,
    type ConversationRegistryCheckpointState,
    type ConversationRegistryPayload,
    conversationRegistryPayloadSchema,
    type ConversationRegistryState,
    createEmptyConversationRegistryCheckpointState,
    DEFAULT_CHAT_CONVERSATION_TITLE,
    normalizeConversationRegistryCheckpointState,
    normalizeConversationRegistryState,
} from './state-schema'
import { buildChatConversationRegistryThreadId, buildChatConversationThreadId } from './thread-id'

const replaceValue = <T>(_left: T, right: T): T => right

const ConversationRegistryStateAnnotation = Annotation.Root({
    conversations: Annotation<ChatConversation[], ChatConversation[]>({
        default: () => [],
        reducer: replaceValue,
    }),
    selectedConversationId: Annotation<string, string>({
        default: () => '',
        reducer: replaceValue,
    }),
    updatedAt: Annotation<string, string>({
        default: () => '',
        reducer: replaceValue,
    }),
})

type ConversationRegistryGraphState = typeof ConversationRegistryStateAnnotation.State

function createConversationRegistryGraph(checkpointer: BaseCheckpointSaver) {
    return new StateGraph(ConversationRegistryStateAnnotation)
        .addNode('save', (state: ConversationRegistryGraphState) => normalizeConversationRegistryCheckpointState(state))
        .addEdge(START, 'save')
        .addEdge('save', END)
        .compile({
            checkpointer,
            name: 'ai-mind-chat-conversation-registry',
        })
}

function compareIsoTimestampsDesc(left: string, right: string): number {
    if (left === right) {
        return 0
    }

    return left > right ? -1 : 1
}

function normalizeConversationTitle(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, CHAT_CONVERSATION_TITLE_LIMIT)
}

function buildConversationTitle(userText: string | undefined): string {
    const normalizedTitle = normalizeConversationTitle(userText ?? '')

    return normalizedTitle || DEFAULT_CHAT_CONVERSATION_TITLE
}

function resolveConversationTitle(currentTitle: string, userText: string | undefined): string {
    if (currentTitle !== DEFAULT_CHAT_CONVERSATION_TITLE) {
        return currentTitle
    }

    return buildConversationTitle(userText)
}

function filterPersistedConversations(conversations: ChatConversation[]): ChatConversation[] {
    return conversations.filter(conversation => conversation.hasMessages)
}

function sortConversations(conversations: ChatConversation[]): ChatConversation[] {
    return [...conversations].sort((left, right) => {
        const lastActiveComparison = compareIsoTimestampsDesc(left.lastActiveAt, right.lastActiveAt)

        if (lastActiveComparison !== 0) {
            return lastActiveComparison
        }

        const createdComparison = compareIsoTimestampsDesc(left.createdAt, right.createdAt)

        if (createdComparison !== 0) {
            return createdComparison
        }

        return left.id.localeCompare(right.id)
    })
}

function createConversation(
    conversationId: string,
    now: string,
    title: string = DEFAULT_CHAT_CONVERSATION_TITLE,
    hasMessages = true
): ChatConversation {
    return {
        id: conversationId,
        title,
        createdAt: now,
        lastActiveAt: now,
        hasMessages,
    }
}

function findFallbackSelectedConversationId(conversations: ChatConversation[], updatedAt: string): string | null {
    if (conversations.length === 0) {
        return null
    }

    const updatedConversation = conversations.find(conversation => conversation.lastActiveAt === updatedAt)

    return updatedConversation?.id ?? conversations[0]!.id
}

function pruneConversations(conversations: ChatConversation[]): ChatConversation[] {
    const nextConversations = sortConversations(conversations)

    if (nextConversations.length <= CHAT_CONVERSATION_REGISTRY_LIMIT) {
        return nextConversations
    }

    return nextConversations.slice(0, CHAT_CONVERSATION_REGISTRY_LIMIT)
}

function finalizeRegistryState(
    registry: ConversationRegistryCheckpointState,
    options: {
        now: string
    }
): ConversationRegistryState {
    const prunedConversations = pruneConversations(sortConversations(filterPersistedConversations(registry.conversations)))
    const nextSelectedConversationId = prunedConversations.some(conversation => conversation.id === registry.selectedConversationId)
        ? registry.selectedConversationId
        : findFallbackSelectedConversationId(prunedConversations, registry.updatedAt || options.now)

    return normalizeConversationRegistryState({
        selectedConversationId: nextSelectedConversationId,
        conversations: prunedConversations,
        updatedAt: registry.updatedAt || options.now,
    })
}

export class ConversationRegistryNotFoundError extends Error {
    constructor(conversationId: string) {
        super(`Conversation "${conversationId}" was not found in the current browser session registry.`)
        this.name = 'ConversationRegistryNotFoundError'
    }
}

export interface ConversationRegistryReadResult {
    registry: ConversationRegistryState | null
    restored: boolean
}

export interface EnsureConversationRegistryOptions {
    conversationId?: string
    now?: string
}

export interface CreateConversationOptions {
    conversationId?: string
    hasMessages?: boolean
    now?: string
    title?: string
    userText?: string
}

export interface SelectConversationOptions {
    now?: string
}

export interface TouchConversationOptions {
    hasMessages?: boolean
    markSelected?: boolean
    now?: string
    userText?: string
}

export interface ConversationRegistryService {
    createConversation(sessionId: string, options?: CreateConversationOptions): Promise<ConversationRegistryState>
    deleteConversation(sessionId: string, conversationId: string, options?: SelectConversationOptions): Promise<ConversationRegistryState>
    ensureRegistry(sessionId: string, options?: EnsureConversationRegistryOptions): Promise<ConversationRegistryState>
    getConversation(sessionId: string, conversationId: string): Promise<ChatConversation | null>
    readRegistry(sessionId: string): Promise<ConversationRegistryReadResult>
    selectConversation(sessionId: string, conversationId: string, options?: SelectConversationOptions): Promise<ConversationRegistryState>
    touchConversation(sessionId: string, conversationId: string, options?: TouchConversationOptions): Promise<ConversationRegistryState>
    toConversationRegistryPayload(registry: ConversationRegistryState): ConversationRegistryPayload
    writeRegistry(sessionId: string, registry: ConversationRegistryState): Promise<void>
}

let sharedConversationRegistryService: ConversationRegistryService | undefined
let sharedConversationRegistryServiceKey: string | undefined

function buildConversationRegistryServiceKey(config: ChatMemoryRuntimeConfig, env: Record<string, string | undefined>): string {
    return [config.checkpointMode, env.NODE_ENV ?? '', env.DATABASE_URL?.trim() ?? ''].join('|')
}

interface CreateConversationRegistryServiceOptions {
    now?: () => string
}

export function createConversationRegistryService(
    config: ChatMemoryRuntimeConfig = getChatMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateConversationRegistryServiceOptions = {}
): ConversationRegistryService {
    const checkpointer = getChatMemoryCheckpointer(config.checkpointMode, env)
    const graph = checkpointer ? createConversationRegistryGraph(checkpointer) : null
    const chatMemory = getChatMemoryService(config, env)
    const getNow = options.now ?? (() => new Date().toISOString())

    const getConfig = (sessionId: string) => ({
        configurable: {
            thread_id: buildChatConversationRegistryThreadId(sessionId, env),
        },
        durability: 'sync' as const,
    })

    const readCheckpointState = async (sessionId: string) => {
        if (!graph) {
            return createEmptyConversationRegistryCheckpointState()
        }

        const snapshot = await graph.getState(getConfig(sessionId))

        return normalizeConversationRegistryCheckpointState(snapshot.values)
    }

    return {
        async createConversation(sessionId, createOptions = {}) {
            const now = createOptions.now ?? getNow()
            const current = await this.readRegistry(sessionId)
            const registry = current.registry
            const conversationId = createOptions.conversationId ?? createId()

            if (registry?.conversations.some(conversation => conversation.id === conversationId)) {
                return this.selectConversation(sessionId, conversationId, { now })
            }

            const nextRegistry = finalizeRegistryState(
                {
                    conversations: [
                        ...(registry?.conversations ?? []),
                        createConversation(
                            conversationId,
                            now,
                            createOptions.title ?? buildConversationTitle(createOptions.userText),
                            createOptions.hasMessages ?? true
                        ),
                    ],
                    selectedConversationId: conversationId,
                    updatedAt: now,
                },
                { now }
            )

            await this.writeRegistry(sessionId, nextRegistry)
            return nextRegistry
        },

        async deleteConversation(sessionId, conversationId, deleteOptions = {}) {
            const now = deleteOptions.now ?? getNow()
            const registry = await this.ensureRegistry(sessionId)
            const existingConversation = registry.conversations.find(conversation => conversation.id === conversationId)

            if (!existingConversation) {
                throw new ConversationRegistryNotFoundError(conversationId)
            }

            await chatMemory.deleteThreadState(buildChatConversationThreadId(sessionId, conversationId, env))

            const nextRegistry = finalizeRegistryState(
                {
                    conversations: registry.conversations.filter(conversation => conversation.id !== conversationId),
                    selectedConversationId: registry.selectedConversationId,
                    updatedAt: now,
                },
                { now }
            )

            await this.writeRegistry(sessionId, nextRegistry)
            return nextRegistry
        },

        async ensureRegistry(sessionId, ensureOptions = {}) {
            const now = ensureOptions.now ?? getNow()
            const current = await this.readRegistry(sessionId)

            if (!current.registry) {
                return finalizeRegistryState(createEmptyConversationRegistryCheckpointState(), { now })
            }

            const nextRegistry = finalizeRegistryState(
                {
                    conversations: current.registry.conversations,
                    selectedConversationId: current.registry.selectedConversationId,
                    updatedAt: current.registry.updatedAt,
                },
                { now }
            )

            if (JSON.stringify(nextRegistry) !== JSON.stringify(current.registry)) {
                await this.writeRegistry(sessionId, nextRegistry)
            }

            return nextRegistry
        },

        async getConversation(sessionId, conversationId) {
            const current = await this.readRegistry(sessionId)

            if (!current.registry) {
                return null
            }

            return current.registry.conversations.find(conversation => conversation.id === conversationId) ?? null
        },

        async readRegistry(sessionId) {
            if (!graph) {
                return {
                    registry: null,
                    restored: false,
                }
            }

            const checkpointState = await readCheckpointState(sessionId)
            const restored = checkpointState.conversations.length > 0

            if (!restored) {
                return {
                    registry: null,
                    restored: false,
                }
            }

            return {
                registry: finalizeRegistryState(checkpointState, {
                    now: checkpointState.updatedAt || getNow(),
                }),
                restored: true,
            }
        },

        async selectConversation(sessionId, conversationId, selectOptions = {}) {
            const now = selectOptions.now ?? getNow()
            const registry = await this.ensureRegistry(sessionId)
            const existingConversation = registry.conversations.find(conversation => conversation.id === conversationId)

            if (!existingConversation) {
                throw new ConversationRegistryNotFoundError(conversationId)
            }

            const nextRegistry = finalizeRegistryState(
                {
                    conversations: registry.conversations,
                    selectedConversationId: conversationId,
                    updatedAt: now,
                },
                { now }
            )

            await this.writeRegistry(sessionId, nextRegistry)
            return nextRegistry
        },

        async touchConversation(sessionId, conversationId, touchOptions = {}) {
            const now = touchOptions.now ?? getNow()
            const registry = await this.ensureRegistry(sessionId)
            const existingConversation = registry.conversations.find(conversation => conversation.id === conversationId)

            if (!existingConversation) {
                throw new ConversationRegistryNotFoundError(conversationId)
            }

            const nextRegistry = finalizeRegistryState(
                {
                    conversations: registry.conversations.map(conversation =>
                        conversation.id === conversationId
                            ? {
                                  ...conversation,
                                  hasMessages: touchOptions.hasMessages ?? conversation.hasMessages,
                                  lastActiveAt: now,
                                  title: resolveConversationTitle(conversation.title, touchOptions.userText),
                              }
                            : conversation
                    ),
                    selectedConversationId: touchOptions.markSelected ? conversationId : registry.selectedConversationId,
                    updatedAt: now,
                },
                { now }
            )

            await this.writeRegistry(sessionId, nextRegistry)
            return nextRegistry
        },

        toConversationRegistryPayload(registry) {
            const conversations: ConversationListItem[] = sortConversations(registry.conversations).map(conversation => ({
                id: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                lastActiveAt: conversation.lastActiveAt,
                selected: conversation.id === registry.selectedConversationId,
                hasMessages: conversation.hasMessages,
            }))

            return conversationRegistryPayloadSchema.parse({
                selectedConversationId: registry.selectedConversationId,
                conversations,
                limit: CHAT_CONVERSATION_REGISTRY_LIMIT,
            })
        },

        async writeRegistry(sessionId, registry) {
            if (!graph) {
                return
            }

            await graph.invoke(
                {
                    conversations: registry.conversations,
                    selectedConversationId: registry.selectedConversationId ?? '',
                    updatedAt: registry.updatedAt,
                },
                getConfig(sessionId)
            )
        },
    }
}

export function getConversationRegistryService(
    config: ChatMemoryRuntimeConfig = getChatMemoryRuntimeConfig(),
    env: Record<string, string | undefined> = process.env,
    options: CreateConversationRegistryServiceOptions = {}
): ConversationRegistryService {
    const serviceKey = buildConversationRegistryServiceKey(config, env)

    if (!sharedConversationRegistryService || sharedConversationRegistryServiceKey !== serviceKey) {
        sharedConversationRegistryService = createConversationRegistryService(config, env, options)
        sharedConversationRegistryServiceKey = serviceKey
    }

    return sharedConversationRegistryService
}

export const conversationRegistryService: ConversationRegistryService = {
    createConversation(sessionId, options) {
        return getConversationRegistryService().createConversation(sessionId, options)
    },
    deleteConversation(sessionId, conversationId, options) {
        return getConversationRegistryService().deleteConversation(sessionId, conversationId, options)
    },
    ensureRegistry(sessionId, options) {
        return getConversationRegistryService().ensureRegistry(sessionId, options)
    },
    getConversation(sessionId, conversationId) {
        return getConversationRegistryService().getConversation(sessionId, conversationId)
    },
    readRegistry(sessionId) {
        return getConversationRegistryService().readRegistry(sessionId)
    },
    selectConversation(sessionId, conversationId, options) {
        return getConversationRegistryService().selectConversation(sessionId, conversationId, options)
    },
    touchConversation(sessionId, conversationId, options) {
        return getConversationRegistryService().touchConversation(sessionId, conversationId, options)
    },
    toConversationRegistryPayload(registry) {
        return getConversationRegistryService().toConversationRegistryPayload(registry)
    },
    writeRegistry(sessionId, registry) {
        return getConversationRegistryService().writeRegistry(sessionId, registry)
    },
}
