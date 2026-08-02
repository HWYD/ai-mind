import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'

import type { MindMessage, MindMessagePart } from '@/lib/ai/types/message'

import {
    createAgentInterruptPart,
    createAgentTextArtifact,
    createAssistantPlaceholder,
    createImageBriefPart,
    createImageResultPart,
    createPromptPart,
    createReasoningPart,
    createResourcePart,
    createSkillPart,
    createTextPart,
    createThreadMemoryStatusPart,
    createToolPart,
    createWorkflowProgressPart,
} from './message-factory'
import {
    appendAgentGraphRoutePart,
    appendAgentTextArtifact,
    appendAgentTextArtifactDelta,
    appendPart,
    appendTextualPartDelta,
    applyWorkflowProgressStepChunk,
    ensureAssistantMessage,
    pruneTransientMessages,
    updateAgentInterruptPartStatus,
    updateAgentTextArtifact,
    updateMessageStatus,
    updatePromptPart,
    updateResourcePart,
    updateToolPart,
    updateWorkflowProgressPart,
    upsertAgentGraphDebugSummaryPart,
    upsertAgentGraphNodePart,
    upsertAgentInterruptPart,
    upsertImageBriefPart,
    upsertImageResultPart,
    upsertThreadMemoryStatusPart,
    upsertWorkflowProgressPart,
} from './message-operations'

/** 当前流正在写入的 assistant message 与文本 part 指针。 */
export interface StreamActiveState {
    messageId: string | null
    reasoningPartId: string | null
    textPartId: string | null
}

/**
 * 前端消息树 reducer 状态。
 * stream-core 只定义协议 chunk，这里只负责把 chunk 映射成当前 UI 使用的 MindMessage/ViewModel。
 */
export interface StreamMessageState {
    activeStream: StreamActiveState
    messages: MindMessage[]
}

/** text/reasoning buffer flush 时提交给 reducer 的最小文本增量。 */
export interface PendingTextDelta {
    delta: string
    messageId: string
    partId: string
    partType: 'reasoning' | 'text'
}

/**
 * stream reducer 的返回结果。
 * fatalError 只表示 runtime/request 这类顶层错误，React status/error 仍由 useChatStream 统一处理。
 */
export interface StreamMessageReducerResult {
    fatalError?: string
    state: StreamMessageState
}

export function createInitialActiveStreamState(): StreamActiveState {
    return {
        messageId: null,
        reasoningPartId: null,
        textPartId: null,
    }
}

export function createStreamMessageState(messages: MindMessage[] = []): StreamMessageState {
    return {
        activeStream: createInitialActiveStreamState(),
        messages,
    }
}

function applyMessages(state: StreamMessageState, messages: MindMessage[]): StreamMessageReducerResult {
    return {
        state: {
            ...state,
            messages,
        },
    }
}

function applyMessagesAndActiveStream(
    state: StreamMessageState,
    messages: MindMessage[],
    activeStream: StreamActiveState
): StreamMessageReducerResult {
    return {
        state: {
            activeStream,
            messages,
        },
    }
}

function updateActiveMessage(
    state: StreamMessageState,
    updateMessages: (messages: MindMessage[], messageId: string) => MindMessage[]
): StreamMessageReducerResult {
    const messageId = state.activeStream.messageId

    return messageId ? applyMessages(state, updateMessages(state.messages, messageId)) : { state }
}

function appendActivePartMessages(state: StreamMessageState, part: MindMessagePart): MindMessage[] {
    const messageId = state.activeStream.messageId

    return messageId ? appendPart(state.messages, messageId, part) : state.messages
}

function appendActivePart(state: StreamMessageState, part: MindMessagePart): StreamMessageReducerResult {
    return applyMessages(state, appendActivePartMessages(state, part))
}

function findMessage(messages: MindMessage[], messageId: string | null) {
    return messageId ? messages.find(message => message.id === messageId) : undefined
}

function getThreadMemoryTargetMessageId(state: StreamMessageState) {
    if (state.activeStream.messageId) {
        return state.activeStream.messageId
    }

    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
        const message = state.messages[index]

        if (message.role === 'assistant') {
            return message.id
        }
    }

    return null
}

/** 局部 part 错误只更新卡片；顶层错误返回 fatalError 交给 hook 收口。 */
function handleStreamPartError(state: StreamMessageState, chunk: Extract<ChatStreamChunk, { type: 'error' }>): StreamMessageReducerResult {
    const messageId = state.activeStream.messageId

    if (!messageId || !chunk.partId) {
        return chunk.scope === 'runtime' || chunk.scope === 'request' ? { fatalError: chunk.message, state } : { state }
    }

    switch (chunk.scope) {
        case 'tool':
            return applyMessages(
                state,
                updateToolPart(state.messages, messageId, chunk.partId, part => ({
                    ...part,
                    error: chunk.message,
                    input: chunk.input ?? part.input,
                    location: chunk.location ?? part.location,
                    serverId: chunk.serverId ?? part.serverId,
                    source: chunk.source ?? part.source,
                    status: 'failed',
                    toolName: chunk.toolName ?? part.toolName,
                }))
            )
        case 'resource':
            return applyMessages(
                state,
                updateResourcePart(state.messages, messageId, chunk.partId, part => ({
                    ...part,
                    error: chunk.message,
                    location: chunk.location ?? part.location,
                    resourceName: chunk.resourceName ?? part.resourceName,
                    serverId: chunk.serverId ?? part.serverId,
                    source: chunk.source ?? part.source,
                    status: 'failed',
                    uri: chunk.uri ?? part.uri,
                }))
            )
        case 'prompt':
            return applyMessages(
                state,
                updatePromptPart(state.messages, messageId, chunk.partId, part => ({
                    ...part,
                    error: chunk.message,
                    location: chunk.location ?? part.location,
                    promptName: chunk.promptName ?? part.promptName,
                    serverId: chunk.serverId ?? part.serverId,
                    source: chunk.source ?? part.source,
                    status: 'failed',
                }))
            )
        case 'request':
        case 'runtime':
            return {
                fatalError: chunk.message,
                state,
            }
    }
}

/**
 * text/reasoning delta 频率很高，先由 useStreamTextBuffer 合并，
 * 再批量落到消息树，避免 token 级 React state 更新。
 */
export function reduceStreamTextDeltas(state: StreamMessageState, deltas: PendingTextDelta[]): StreamMessageReducerResult {
    if (deltas.length === 0) {
        return { state }
    }

    return applyMessages(
        state,
        deltas.reduce(
            (messagesSoFar, pendingDelta) =>
                appendTextualPartDelta(
                    messagesSoFar,
                    pendingDelta.messageId,
                    pendingDelta.partId,
                    pendingDelta.partType,
                    pendingDelta.delta
                ),
            state.messages
        )
    )
}

/**
 * 处理“结构性 chunk -> 消息树”的纯转换。
 * 请求、React status、AbortController 等副作用仍留在 useChatStream。
 */
export function reduceStreamChunk(state: StreamMessageState, chunk: ChatStreamChunk): StreamMessageReducerResult {
    switch (chunk.type) {
        case 'start':
            return applyMessagesAndActiveStream(state, [...state.messages, createAssistantPlaceholder(chunk.messageId)], {
                messageId: chunk.messageId,
                reasoningPartId: null,
                textPartId: null,
            })
        case 'agent-interrupt':
            return applyMessagesAndActiveStream(
                state,
                upsertAgentInterruptPart(state.messages, chunk.assistantMessageId, createAgentInterruptPart(chunk)),
                {
                    messageId: chunk.assistantMessageId,
                    reasoningPartId: null,
                    textPartId: null,
                }
            )
        case 'agent-resume':
            return applyMessagesAndActiveStream(
                state,
                updateMessageStatus(
                    updateAgentInterruptPartStatus(
                        ensureAssistantMessage(state.messages, chunk.assistantMessageId),
                        chunk.assistantMessageId,
                        chunk.interruptId,
                        'decided'
                    ),
                    chunk.assistantMessageId,
                    'resuming'
                ),
                {
                    messageId: chunk.assistantMessageId,
                    reasoningPartId: null,
                    textPartId: null,
                }
            )
        case 'skill-selected':
            return appendActivePart(state, createSkillPart(chunk.skillId, chunk.name, chunk.description))
        case 'thread-memory-status': {
            const messageId = getThreadMemoryTargetMessageId(state)

            if (!messageId) {
                return { state }
            }

            return applyMessages(state, upsertThreadMemoryStatusPart(state.messages, messageId, createThreadMemoryStatusPart(chunk)))
        }
        case 'agent-graph-node-start':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertAgentGraphNodePart(
                    messages,
                    messageId,
                    {
                        nodeId: chunk.nodeId,
                        partId: chunk.partId,
                        patchSummaries: [],
                        status: 'running',
                        stepIndex: chunk.stepIndex,
                        title: chunk.title,
                    },
                    chunk.runId,
                    chunk.agentName
                )
            )
        case 'agent-graph-node-end':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertAgentGraphNodePart(
                    messages,
                    messageId,
                    {
                        durationMs: chunk.durationMs,
                        error: chunk.error,
                        nodeId: chunk.nodeId,
                        partId: chunk.partId,
                        severity: chunk.severity,
                        status: chunk.status,
                        summary: chunk.summary,
                        tags: chunk.tags,
                    },
                    chunk.runId,
                    chunk.agentName
                )
            )
        case 'agent-graph-route':
            return updateActiveMessage(state, (messages, messageId) =>
                appendAgentGraphRoutePart(
                    messages,
                    messageId,
                    {
                        fromNodeId: chunk.fromNodeId,
                        reason: chunk.reason,
                        routeLabel: chunk.routeLabel,
                        toNodeId: chunk.toNodeId,
                    },
                    chunk.runId,
                    chunk.agentName
                )
            )
        case 'agent-graph-state-patch':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertAgentGraphNodePart(
                    messages,
                    messageId,
                    {
                        nodeId: chunk.nodeId,
                        patchSummaries: [chunk.patchSummary],
                    },
                    chunk.runId,
                    chunk.agentName
                )
            )
        case 'agent-graph-debug-summary':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertAgentGraphDebugSummaryPart(messages, messageId, chunk.summary, chunk.runId, chunk.agentName)
            )
        case 'workflow-progress-start':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertWorkflowProgressPart(messages, messageId, createWorkflowProgressPart(chunk))
            )
        case 'workflow-progress-step':
            return updateActiveMessage(state, (messages, messageId) => applyWorkflowProgressStepChunk(messages, messageId, chunk))
        case 'workflow-progress-end':
            return updateActiveMessage(state, (messages, messageId) =>
                updateWorkflowProgressPart(messages, messageId, chunk.workflowId, part => ({
                    ...part,
                    status: chunk.status,
                    summary: chunk.summary ?? part.summary,
                    endedAt: chunk.endedAt,
                    durationMs: chunk.durationMs,
                    failureMessage: chunk.failureMessage,
                    visibility: 'collapsed',
                }))
            )
        case 'image-brief':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertImageBriefPart(messages, messageId, createImageBriefPart(chunk))
            )
        case 'image-result-ready':
            return updateActiveMessage(state, (messages, messageId) =>
                upsertImageResultPart(messages, messageId, createImageResultPart(chunk))
            )
        case 'text-start':
            return applyMessagesAndActiveStream(state, appendActivePartMessages(state, createTextPart('', chunk.partId)), {
                ...state.activeStream,
                textPartId: chunk.partId,
            })
        case 'text-delta':
        case 'text-end':
            return { state }
        case 'artifact-start':
            return updateActiveMessage(state, (messages, messageId) =>
                appendAgentTextArtifact(messages, messageId, createAgentTextArtifact(chunk))
            )
        case 'artifact-delta':
            return updateActiveMessage(state, (messages, messageId) =>
                appendAgentTextArtifactDelta(messages, messageId, chunk.artifactId, chunk.delta)
            )
        case 'artifact-end':
            return updateActiveMessage(state, (messages, messageId) =>
                updateAgentTextArtifact(messages, messageId, chunk.artifactId, artifact => ({
                    ...artifact,
                    error: chunk.error,
                    metadata: {
                        ...artifact.metadata,
                        ...chunk.metadata,
                    },
                    status: chunk.status,
                }))
            )
        case 'reasoning-start':
            return applyMessagesAndActiveStream(state, appendActivePartMessages(state, createReasoningPart('', chunk.partId)), {
                ...state.activeStream,
                reasoningPartId: chunk.partId,
            })
        case 'reasoning-delta':
        case 'reasoning-end':
            return { state }
        case 'tool-start':
            return appendActivePart(
                state,
                createToolPart(
                    chunk.partId,
                    chunk.toolName,
                    chunk.input,
                    chunk.title,
                    chunk.action,
                    chunk.source,
                    chunk.location,
                    chunk.serverId
                )
            )
        case 'tool-end':
            return updateActiveMessage(state, (messages, messageId) =>
                updateToolPart(messages, messageId, chunk.partId, part => ({
                    ...part,
                    action: chunk.action ?? part.action,
                    location: chunk.location ?? part.location,
                    output: chunk.output,
                    serverId: chunk.serverId ?? part.serverId,
                    source: chunk.source ?? part.source,
                    status: 'completed',
                    title: chunk.title ?? part.title,
                }))
            )
        case 'prompt-start':
            return appendActivePart(
                state,
                createPromptPart(chunk.partId, chunk.promptName, 'called', chunk.source, chunk.location, chunk.serverId, chunk.input)
            )
        case 'prompt-end':
            return updateActiveMessage(state, (messages, messageId) =>
                updatePromptPart(messages, messageId, chunk.partId, part => ({
                    ...part,
                    location: chunk.location ?? part.location,
                    messageCount: chunk.messageCount,
                    promptName: chunk.promptName,
                    serverId: chunk.serverId ?? part.serverId,
                    source: chunk.source ?? part.source,
                    status: chunk.status,
                }))
            )
        case 'resource-start':
            return appendActivePart(
                state,
                createResourcePart(chunk.partId, chunk.resourceName, chunk.uri, chunk.serverId, chunk.source, chunk.location)
            )
        case 'resource-end':
            return updateActiveMessage(state, (messages, messageId) =>
                updateResourcePart(messages, messageId, chunk.partId, part => ({
                    ...part,
                    contentPreview: chunk.contentPreview,
                    isTruncated: chunk.isTruncated,
                    location: chunk.location ?? part.location,
                    previewChars: chunk.previewChars,
                    resourceName: chunk.resourceName,
                    serverId: chunk.serverId,
                    source: chunk.source ?? part.source,
                    status: 'completed',
                    uri: chunk.uri,
                }))
            )
        case 'finish': {
            const activeMessage = findMessage(state.messages, state.activeStream.messageId)
            const messages =
                activeMessage?.status === 'paused' || !state.activeStream.messageId
                    ? state.messages
                    : updateMessageStatus(state.messages, state.activeStream.messageId, 'completed')

            return applyMessagesAndActiveStream(state, pruneTransientMessages(messages), createInitialActiveStreamState())
        }
        case 'error':
            return handleStreamPartError(state, chunk)
    }
}
