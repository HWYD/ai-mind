'use client'

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { useEffect, useRef, useState } from 'react'

import { resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { isAbortError } from '@/lib/ai/error-utils'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatStreamEventEnvelope } from '@/lib/ai/stream-chunk-schema'
import type { StreamApiErrorCode, StreamReplayDescriptor } from '@/lib/ai/stream-recovery/contracts'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatRequestInput, ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'
import type { AgentInterruptPart, MindMessage } from '@/lib/ai/types/message'

import { createMessage, createTextPart } from './chat-stream/message-factory'
import {
    appendPart,
    ensureAssistantMessage,
    getLastUserTurnForRegeneration,
    pruneTransientMessages,
    removeMessage,
    removeUserTurnPair,
    updateMessageStatus,
} from './chat-stream/message-operations'
import { buildRequestMessages, toRequestSkill } from './chat-stream/request-message-builder'
import {
    createInitialActiveStreamState,
    createStreamMessageState,
    reduceStreamChunk,
    reduceStreamTextDeltas,
    type StreamMessageReducerResult,
    type StreamMessageState,
} from './chat-stream/stream-message-reducer'
import { type ConsumedStreamCursor, consumeNdjsonStream } from './chat-stream/stream-reader'
import { initialPostRetryPolicy, isRetryableInitialPostStatus, resolveStreamReconnectDecision } from './chat-stream/stream-reconnect'
import { useStreamTextBuffer } from './chat-stream/use-stream-text-buffer'
import type { LocalConversationMetadata } from './local-chat-persistence/schema'
import { createLocalConversationSnapshot } from './local-chat-persistence/stable-snapshot'
import { readLocalConversationSnapshot, writeLocalConversationSnapshot } from './local-chat-persistence/store'

// 文本/推理 delta 的批量刷新窗口。流式 token 先进入 buffer，再按约 40ms + rAF 合并写入 React state。
// 调大：Markdown 解析和 DOM 更新更少但打字感更钝；调小：更实时但更容易触发渲染/滚动抖动。
const STREAM_TEXT_FLUSH_INTERVAL_MS = 40
// 兼容旧实现残留的本地 key。v0.3.0 明确不支持刷新后恢复 pending HITL；
// 如果后续重新启用，必须同时恢复 assistant message、interrupt payload 和同消息续写上下文，而不是只拉起一张审核卡。
const PENDING_AGENT_RUN_STORAGE_KEY = 'ai-mind:pending-agent-run-id'

interface ThreadHydrationResponse {
    conversationId?: string
    messages?: MindMessage[]
    restored?: boolean
}

interface ThreadHydrationErrorResponse {
    code?: string
    error?: string
}

type ChatRequestError = Error & {
    code?: string
    initialPostRetryable?: boolean
    userMessage?: string
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return '请求失败，请稍后重试。'
}

function isRetryableInitialPostError(error: unknown): boolean {
    return error instanceof TypeError || (error as ChatRequestError | null)?.initialPostRetryable === true
}

function createUnconfirmedInitialPostError(): ChatRequestError {
    const error = new Error('初始请求状态未确认，请稍后重试。') as ChatRequestError

    error.userMessage = error.message
    return error
}

function getResumeAgentRunUserMessage(code: string | null, fallback: string, status: number): string {
    switch (code) {
        case 'AGENT_RUN_FORBIDDEN':
            return '当前审核点不属于当前浏览器会话，可能是页面会话或本地密钥已变化。请重新发起 /tasklist。'
        case 'AGENT_INTERRUPT_NOT_PENDING':
            return '当前审核点已被处理或已失效。请重新发起 /tasklist。'
        case 'AGENT_RUN_NOT_PAUSED':
            return '当前 AgentRun 已不在等待审核状态。请重新发起 /tasklist。'
        case 'AGENT_RUN_VERSION_MISMATCH':
            return '当前审核点来自旧版本运行，无法继续恢复。请重新发起 /tasklist。'
        default:
            return fallback || `恢复 AgentRun 失败，状态码：${status}`
    }
}

function createClientStreamRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
    }

    return `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isStreamReplayDescriptor(value: unknown): value is StreamReplayDescriptor {
    return (
        Boolean(value) &&
        typeof value === 'object' &&
        (value as StreamReplayDescriptor).kind === 'stream-replay' &&
        typeof (value as StreamReplayDescriptor).runId === 'string' &&
        typeof (value as StreamReplayDescriptor).streamUrl === 'string'
    )
}

function resolveStreamApiErrorCode(value: unknown): StreamApiErrorCode | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const code = (value as { code?: unknown }).code

    return typeof code === 'string' ? (code as StreamApiErrorCode) : undefined
}

function waitForReconnectDelay(delayMs: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Request aborted', 'AbortError'))
            return
        }

        const timer = window.setTimeout(resolve, delayMs)

        signal.addEventListener(
            'abort',
            () => {
                window.clearTimeout(timer)
                reject(new DOMException('Request aborted', 'AbortError'))
            },
            { once: true }
        )
    })
}

async function fetchInitialPostWithinBudget(
    input: RequestInfo | URL,
    init: RequestInit,
    controller: AbortController,
    timeoutMs: number
): Promise<Response> {
    const attemptController = new AbortController()
    let timedOut = false
    let keepAbortLink = false
    const abortAttempt = () => attemptController.abort()

    if (controller.signal.aborted) {
        throw new DOMException('Request aborted', 'AbortError')
    }

    controller.signal.addEventListener('abort', abortAttempt, { once: true })
    const timeout = window.setTimeout(() => {
        timedOut = true
        attemptController.abort()
    }, timeoutMs)

    try {
        const response = await fetch(input, {
            ...init,
            signal: attemptController.signal,
        })

        // response body 仍属于这次 fetch；保留用户取消到其 signal 的连接，
        // 但清掉预算 timer，避免拿到响应头后中断正常流读取。
        keepAbortLink = true
        return response
    } catch (error) {
        if (controller.signal.aborted) {
            throw new DOMException('Request aborted', 'AbortError')
        }

        if (timedOut) {
            const timeoutError = new Error('初始请求等待超时。') as ChatRequestError

            timeoutError.initialPostRetryable = true
            throw timeoutError
        }

        throw error
    } finally {
        window.clearTimeout(timeout)
        if (!keepAbortLink) {
            controller.signal.removeEventListener('abort', abortAttempt)
        }
    }
}

interface UseChatStreamOptions {
    conversationId?: string
    conversationMetadata?: LocalConversationMetadata | null
    draftMode?: boolean
    skillMode?: ChatSkillMode
    model?: ChatModel
    enableReasoning?: boolean
    onConversationPromoted?: (conversationId: string) => void | Promise<void>
}

export interface PendingAgentInterrupt {
    messageId: string
    part: AgentInterruptPart
}

export interface ThreadMemoryStatusHint {
    status: 'failed' | 'started' | 'succeeded'
    message: string
    pinnedDecisionCount?: number
    summaryLength?: number
}

export type ConversationHydrationStatus = 'idle' | 'loading' | 'ready' | 'failed'
export type StreamRecoveryStatus =
    | 'idle'
    | 'connected'
    | 'disconnected'
    | 'reconnecting'
    | 'paused'
    | 'cancel_requested'
    | 'terminal'
    | 'recovery_unavailable'

interface ActiveStreamRecovery {
    cursor: ConsumedStreamCursor | null
    idempotencyKey: string
    runId: string | null
    streamUrl: string | null
    paused?: boolean
    terminal?: boolean
}

function findPendingAgentInterrupt(messages: MindMessage[]): PendingAgentInterrupt | null {
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const message = messages[messageIndex]
        const interruptPart = message.parts.find(
            (part): part is AgentInterruptPart => part.type === 'agent-interrupt' && part.status === 'pending'
        )

        if (interruptPart) {
            return {
                messageId: message.id,
                part: interruptPart,
            }
        }
    }

    return null
}

export function useChatStream(options: UseChatStreamOptions = {}) {
    const conversationId = options.conversationId?.trim() || null
    const conversationMetadata = options.conversationMetadata ?? null
    const draftMode = options.draftMode ?? false
    const skillMode = options.skillMode ?? 'auto'
    const model = options.model ?? defaultChatModel
    const enableReasoning = options.enableReasoning ?? false

    const [messages, setMessages] = useState<MindMessage[]>([])
    const [status, setStatus] = useState<ChatStatus>('ready')
    const [error, setError] = useState<string | null>(null)
    const [imageQuotaError, setImageQuotaError] = useState<string | null>(null)
    const [hydrationError, setHydrationError] = useState<string | null>(null)
    const [hydrationStatus, setHydrationStatus] = useState<ConversationHydrationStatus>('idle')
    const [readOnlyCacheMessage, setReadOnlyCacheMessage] = useState<string | null>(null)
    const [threadMemoryStatusHint, setThreadMemoryStatusHint] = useState<ThreadMemoryStatusHint | null>(null)
    const [hydrationRetryToken, setHydrationRetryToken] = useState(0)
    const [streamRecoveryStatus, setStreamRecoveryStatus] = useState<StreamRecoveryStatus>('idle')

    const messagesRef = useRef(messages)
    const activeConversationIdRef = useRef<string | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)
    const activeStreamRecoveryRef = useRef<ActiveStreamRecovery | null>(null)
    const hydratedConversationIdRef = useRef<string | null>(null)
    const localSnapshotRevisionRef = useRef(0)

    const streamMessageStateRef = useRef(createStreamMessageState(messages)) //给 stream reducer 用的同步快照，里面有 messages + activeStream。

    /**
     * React state 更新后，把异步代码会读取的两份快照也更新到同一份 messages。
     *
     * messagesRef 只保存最新消息列表，给 send/regenerate/delete 这类异步入口读取。
     * streamMessageStateRef 还额外保存 activeStream 指针，所以这里只替换它的 messages，保留当前正在写入的 part 位置。
     */
    function syncMessageSnapshots(nextMessages: MindMessage[]) {
        messagesRef.current = nextMessages
        streamMessageStateRef.current = {
            ...streamMessageStateRef.current,
            messages: nextMessages,
        }
    }

    /**
     * 执行一次 stream reducer，并把 reducer 算出的新状态提交回 Hook。
     *
     * 结构性 chunk 和 buffer flush 都走这里：先用当前 streamMessageStateRef 计算下一份 state，
     * 再同步更新 streamMessageStateRef、messagesRef 和 React messages。
     * 如果 reducer 返回 fatalError，说明是整轮请求级错误，直接抛给 submitTurn 的 catch 统一展示。
     */
    function commitStreamReduction(applyStreamUpdate: (currentState: StreamMessageState) => StreamMessageReducerResult) {
        const reduction = applyStreamUpdate(streamMessageStateRef.current)

        streamMessageStateRef.current = reduction.state
        messagesRef.current = reduction.state.messages
        setMessages(reduction.state.messages)

        if (reduction.fatalError) {
            throw new Error(reduction.fatalError)
        }
    }

    /**
     * 提交流式消息树更新，同时同步 React state 和 messagesRef。
     * applyMessageUpdate 接收当前完整 messages 列表，并且必须返回更新后的完整 messages 列表。
     */
    function updateMessages(applyMessageUpdate: (currentMessages: MindMessage[]) => MindMessage[]) {
        setMessages(currentMessages => {
            const nextMessages = applyMessageUpdate(currentMessages)
            // 异步提交、取消和重新生成都依赖最新消息快照，ref 与 state 必须同步推进。
            syncMessageSnapshots(nextMessages)
            return nextMessages
        })
    }

    function commitStableLocalSnapshot(nextMessages: MindMessage[], committedConversationId = conversationId) {
        const targetConversationId = committedConversationId?.trim()

        if (!targetConversationId) {
            return
        }

        const now = new Date().toISOString()
        const metadata =
            conversationMetadata && conversationMetadata.id === targetConversationId
                ? conversationMetadata
                : {
                      createdAt: now,
                      hasMessages: nextMessages.length > 0,
                      id: targetConversationId,
                      lastActiveAt: now,
                      title: '新会话',
                  }
        const snapshot = createLocalConversationSnapshot({
            conversation: {
                ...metadata,
                hasMessages: nextMessages.length > 0,
                lastActiveAt: now,
            },
            messages: nextMessages,
            previousRevision: localSnapshotRevisionRef.current,
            snapshotAt: now,
        })

        if (!snapshot) {
            return
        }

        void writeLocalConversationSnapshot(snapshot).then(result => {
            if (result.status === 'written') {
                localSnapshotRevisionRef.current = result.revision
            }
        })
    }

    const textBuffer = useStreamTextBuffer({
        flushIntervalMs: STREAM_TEXT_FLUSH_INTERVAL_MS,
        flushTextDeltas: pendingTextDeltas => {
            // buffer 只负责合并高频 token；真正改消息树仍交回 reducer，避免文本更新逻辑散在两个文件。
            commitStreamReduction(current => reduceStreamTextDeltas(current, pendingTextDeltas))
        },
    })

    useEffect(() => {
        syncMessageSnapshots(messages)
    }, [messages])

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        window.localStorage.removeItem(PENDING_AGENT_RUN_STORAGE_KEY)
    }, [])

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort()
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined' || status === 'submitted' || status === 'streaming') {
            return
        }

        let cancelled = false

        if (!conversationId || draftMode) {
            hydratedConversationIdRef.current = null
            setHydrationError(null)
            setHydrationStatus('idle')
            setReadOnlyCacheMessage(null)
            localSnapshotRevisionRef.current = 0
            setThreadMemoryStatusHint(null)
            syncMessageSnapshots([])
            streamMessageStateRef.current = createStreamMessageState([])
            setMessages([])
            return () => {
                cancelled = true
            }
        }

        if (hydratedConversationIdRef.current === conversationId) {
            return () => {
                cancelled = true
            }
        }

        hydratedConversationIdRef.current = conversationId
        setHydrationError(null)
        setHydrationStatus('loading')
        setReadOnlyCacheMessage(null)
        localSnapshotRevisionRef.current = 0
        setThreadMemoryStatusHint(null)
        syncMessageSnapshots([])
        streamMessageStateRef.current = createStreamMessageState([])
        setMessages([])

        async function hydrateThread() {
            let hasLocalSnapshot = false

            try {
                const localSnapshot = await readLocalConversationSnapshot(conversationId)

                if (cancelled) {
                    return
                }

                if (localSnapshot.status === 'valid') {
                    hasLocalSnapshot = true
                    localSnapshotRevisionRef.current = localSnapshot.data.revision
                    syncMessageSnapshots(localSnapshot.data.messages)
                    streamMessageStateRef.current = createStreamMessageState(localSnapshot.data.messages)
                    setMessages(localSnapshot.data.messages)
                }

                const response = await fetch(`/api/chat/thread?conversationId=${encodeURIComponent(conversationId)}`)
                const contentType = response.headers.get('Content-Type') ?? ''

                if (!response.ok || !contentType.includes('application/json')) {
                    const errorData = contentType.includes('application/json')
                        ? ((await response.json().catch(() => null)) as ThreadHydrationErrorResponse | null)
                        : null

                    if (hasLocalSnapshot && errorData?.code === 'CHAT_THREAD_HYDRATION_UNAVAILABLE') {
                        setHydrationError(null)
                        setHydrationStatus('ready')
                        setReadOnlyCacheMessage('当前显示的是浏览器本地只读缓存，服务端会话上下文暂时不可用。')
                        return
                    }

                    throw new Error('Thread hydration request failed.')
                }

                const data = (await response.json()) as ThreadHydrationResponse

                if (cancelled || data.conversationId !== conversationId) {
                    return
                }

                if (!data.restored || !Array.isArray(data.messages)) {
                    setHydrationError(null)
                    setHydrationStatus('ready')
                    return
                }

                if (hasLocalSnapshot) {
                    setHydrationError(null)
                    setHydrationStatus('ready')
                    return
                }

                const restoredMessages = data.messages.filter(
                    (message): message is MindMessage =>
                        (message.role === 'user' || message.role === 'assistant') &&
                        (message.status === undefined || message.status === 'completed') &&
                        message.parts.length > 0 &&
                        message.parts.every(part => part.type === 'text')
                )

                syncMessageSnapshots(restoredMessages)
                streamMessageStateRef.current = createStreamMessageState(restoredMessages)
                setMessages(restoredMessages)
                setHydrationError(null)
                setHydrationStatus('ready')
            } catch {
                if (cancelled) {
                    return
                }

                hydratedConversationIdRef.current = null
                if (hasLocalSnapshot) {
                    setHydrationStatus('ready')
                    setHydrationError(null)
                    setReadOnlyCacheMessage('当前显示的是浏览器本地只读缓存，服务端会话暂未确认。')
                } else {
                    setHydrationStatus('failed')
                    setHydrationError('会话加载失败，请重试。')
                }
            }
        }

        void hydrateThread()

        return () => {
            cancelled = true
        }
    }, [conversationId, draftMode, hydrationRetryToken, status])

    /**
     * 重置 active part 指针。
     * 取消、finish 或错误清理后必须重置，避免下一轮 delta 误落到上一轮消息。
     */
    function resetActiveStream() {
        streamMessageStateRef.current = {
            ...streamMessageStateRef.current,
            activeStream: createInitialActiveStreamState(),
        }
    }

    function discardActiveAssistantMessage() {
        const { messageId } = streamMessageStateRef.current.activeStream

        if (!messageId) {
            return
        }

        textBuffer.clear()
        const nextMessages = removeMessage(messagesRef.current, messageId)
        syncMessageSnapshots(nextMessages)
        setMessages(nextMessages)
        resetActiveStream()
    }

    function finalizeAbortedAssistantMessage() {
        // 用户主动中止时，保留已经收到的正文 / 推理 / 工具卡片，只清掉空占位消息，
        // 避免前端把“已看到的半截回答”整条删除。
        textBuffer.clear()
        const nextMessages = pruneTransientMessages(messagesRef.current)
        syncMessageSnapshots(nextMessages)
        setMessages(nextMessages)
        resetActiveStream()
    }

    function surfaceAssistantErrorReply(
        messageText: string,
        options: {
            preservePausedStatus?: boolean
            targetMessageId?: string
        } = {}
    ) {
        const text = messageText.trim() || '请求失败，请稍后重试。'
        const targetMessageId = options.targetMessageId ?? streamMessageStateRef.current.activeStream.messageId

        textBuffer.clear()
        updateMessages(current => {
            const stableMessages = pruneTransientMessages(current)

            if (!targetMessageId) {
                return [
                    ...stableMessages,
                    {
                        ...createMessage('assistant', [createTextPart(text)]),
                        status: 'failed',
                    },
                ]
            }

            const existingTargetMessage = stableMessages.find(message => message.id === targetMessageId)
            const alreadyHasSameText = existingTargetMessage?.parts.some(part => part.type === 'text' && part.text.trim() === text) ?? false
            let nextMessages = ensureAssistantMessage(stableMessages, targetMessageId)

            if (!alreadyHasSameText) {
                nextMessages = appendPart(nextMessages, targetMessageId, createTextPart(text))
            }

            return updateMessageStatus(nextMessages, targetMessageId, options.preservePausedStatus ? 'paused' : 'failed')
        })
        setError(null)
        resetActiveStream()
    }

    /**
     * 缓存当前打开 text part 的 delta。
     * partId 不匹配时丢弃，保护多段输出时不会串写。
     */
    function appendTextDeltaBuffered(chunk: Extract<ChatStreamChunk, { type: 'text-delta' }>) {
        const { messageId, textPartId } = streamMessageStateRef.current.activeStream

        if (!messageId || textPartId !== chunk.partId) {
            return
        }

        textBuffer.enqueue(messageId, chunk.partId, 'text', chunk.delta)
    }

    /**
     * 缓存当前打开 reasoning part 的 delta。
     * reasoning 与 text 分开校验 partId，避免推理内容和正文互相拼接。
     */
    function appendReasoningDeltaBuffered(chunk: Extract<ChatStreamChunk, { type: 'reasoning-delta' }>) {
        const { messageId, reasoningPartId } = streamMessageStateRef.current.activeStream

        if (!messageId || reasoningPartId !== chunk.partId) {
            return
        }

        textBuffer.enqueue(messageId, chunk.partId, 'reasoning', chunk.delta)
    }

    function handleChunk(chunk: ChatStreamChunk) {
        if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') {
            // 结构性 chunk 到来前先落地文本，避免卡片/结束事件插到尚未 flush 的正文前面。
            textBuffer.flush()
        }

        switch (chunk.type) {
            case 'text-delta':
                appendTextDeltaBuffered(chunk)
                return
            case 'reasoning-delta':
                appendReasoningDeltaBuffered(chunk)
                return
            case 'thread-memory-status':
                setThreadMemoryStatusHint({
                    status: chunk.status,
                    message: chunk.message,
                    ...(typeof chunk.pinnedDecisionCount === 'number' ? { pinnedDecisionCount: chunk.pinnedDecisionCount } : {}),
                    ...(typeof chunk.summaryLength === 'number' ? { summaryLength: chunk.summaryLength } : {}),
                })
                commitStreamReduction(current => reduceStreamChunk(current, chunk))
                return
            default:
                // 结构性 chunk 统一交给 reducer：start/tool/resource/prompt/artifact/error/finish 等消息树变化都在一个入口收口。
                commitStreamReduction(current => reduceStreamChunk(current, chunk))
                return
        }
    }

    function updateRecoveryCursor(cursor: ConsumedStreamCursor) {
        const recovery = activeStreamRecoveryRef.current

        if (!recovery) {
            return
        }

        activeStreamRecoveryRef.current = {
            ...recovery,
            cursor,
            runId: cursor.runId,
            streamUrl: recovery.streamUrl ?? `/api/chat/runs/${encodeURIComponent(cursor.runId)}/stream`,
        }
    }

    function shouldApplyRecoveryEnvelope(envelope: ChatStreamEventEnvelope) {
        const recovery = activeStreamRecoveryRef.current
        const lastSequence = recovery?.cursor?.lastAcknowledgedSequence ?? 0
        const expectedRunId = recovery?.runId ?? recovery?.cursor?.runId
        const expectedProtocolVersion = recovery?.cursor?.protocolVersion ?? 1

        if (expectedRunId && envelope.runId !== expectedRunId) {
            throw new Error('恢复流事件属于其他 run，已停止应用。')
        }

        if (envelope.protocolVersion !== expectedProtocolVersion) {
            throw new Error('恢复流协议版本不匹配，请刷新后重试。')
        }

        if (envelope.sequence <= lastSequence) {
            if (envelope.sequence === lastSequence && recovery?.cursor?.eventId && envelope.eventId !== recovery.cursor.eventId) {
                throw new Error('恢复流事件标识与已确认游标不一致。')
            }

            return false
        }

        if (envelope.sequence > lastSequence + 1) {
            throw new Error('恢复流事件出现缺口，请刷新后重试。')
        }

        if (envelope.runStatus === 'paused' || envelope.payload.type === 'agent-interrupt') {
            setStreamRecoveryStatus('paused')
            activeStreamRecoveryRef.current = recovery ? { ...recovery, paused: true } : recovery
        }

        if (envelope.terminal === true) {
            setStreamRecoveryStatus('terminal')
            activeStreamRecoveryRef.current = recovery ? { ...recovery, terminal: true } : recovery
        }

        return true
    }

    async function consumeRecoverableStream(stream: ReadableStream<Uint8Array>, controller: AbortController) {
        await consumeNdjsonStream(stream, handleChunk, {
            onCursor: updateRecoveryCursor,
            shouldApplyEnvelope: shouldApplyRecoveryEnvelope,
        })

        const recovery = activeStreamRecoveryRef.current

        if (recovery?.streamUrl && !recovery.terminal && !recovery.paused && !controller.signal.aborted) {
            throw new Error('流在收到终态前已结束。')
        }
    }

    async function consumeRecoveryGet(streamUrl: string, controller: AbortController) {
        const recovery = activeStreamRecoveryRef.current
        const after = recovery?.cursor?.lastAcknowledgedSequence ?? 0
        const response = await fetch(streamUrl, {
            method: 'GET',
            headers: {
                'Last-Event-ID': String(after),
            },
            signal: controller.signal,
        })

        if (!response.ok) {
            const responseJson = await response.json().catch(() => null)
            const requestError = new Error(responseJson?.error ?? `恢复流失败，状态码：${response.status}`) as ChatRequestError
            requestError.code = resolveStreamApiErrorCode(responseJson)
            requestError.userMessage = responseJson?.error ?? requestError.message
            throw requestError
        }

        if (!response.body) {
            throw new Error('恢复响应缺少可读取的流式内容。')
        }

        setStreamRecoveryStatus('connected')
        await consumeRecoverableStream(response.body, controller)
    }

    async function recoverActiveStream(controller: AbortController) {
        const recovery = activeStreamRecoveryRef.current

        if (!recovery?.streamUrl) {
            throw new Error('当前流缺少可恢复订阅地址。')
        }

        let attempt = 0
        const recoveryStartedAtMs = Date.now()

        while (!controller.signal.aborted) {
            const decision = resolveStreamReconnectDecision({
                attempt,
                elapsedMs: Date.now() - recoveryStartedAtMs,
            })

            if (!decision.retry) {
                setStreamRecoveryStatus('recovery_unavailable')
                throw new Error('恢复流重试次数已达到上限，请重新发起请求。')
            }

            attempt = decision.attempt
            setStreamRecoveryStatus('reconnecting')
            await waitForReconnectDelay(decision.delayMs, controller.signal)

            try {
                await consumeRecoveryGet(recovery.streamUrl, controller)
                return
            } catch (recoveryError) {
                if (isAbortError(recoveryError)) {
                    throw recoveryError
                }

                const decisionAfterError = resolveStreamReconnectDecision({
                    attempt,
                    elapsedMs: Date.now() - recoveryStartedAtMs,
                    errorCode: (recoveryError as ChatRequestError).code as StreamApiErrorCode | undefined,
                })

                if (!decisionAfterError.retry) {
                    setStreamRecoveryStatus('recovery_unavailable')
                    throw recoveryError
                }
            }
        }
    }

    async function requestInitialChatResponse(payload: ChatRequestInput, idempotencyKey: string, controller: AbortController) {
        let attempt = 0
        const retryStartedAtMs = Date.now()

        while (!controller.signal.aborted) {
            try {
                const remainingBudgetMs = initialPostRetryPolicy.totalBudgetMs - (Date.now() - retryStartedAtMs)

                if (remainingBudgetMs <= 0) {
                    setStreamRecoveryStatus('recovery_unavailable')
                    throw createUnconfirmedInitialPostError()
                }

                const response = await fetchInitialPostWithinBudget(
                    '/api/chat',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Idempotency-Key': idempotencyKey,
                        },
                        body: JSON.stringify(payload),
                    },
                    controller,
                    remainingBudgetMs
                )
                const contentType = response.headers.get('Content-Type') ?? ''

                if (!response.ok) {
                    const responseJson = await response.json().catch(() => null)
                    const errorMessage = responseJson?.error ?? `聊天请求失败，状态码：${response.status}`
                    const errorCode = typeof responseJson?.code === 'string' ? responseJson.code : null
                    const requestError = new Error(errorCode ? `${errorMessage}（${errorCode}）` : errorMessage) as ChatRequestError

                    requestError.code = errorCode ?? undefined
                    requestError.initialPostRetryable = isRetryableInitialPostStatus(response.status)
                    requestError.userMessage = errorMessage
                    throw requestError
                }

                if (!response.body) {
                    const requestError = new Error('响应缺少可读取的流式内容。') as ChatRequestError

                    requestError.initialPostRetryable = true
                    throw requestError
                }

                return { contentType, response }
            } catch (requestError) {
                if (controller.signal.aborted || isAbortError(requestError)) {
                    throw new DOMException('Request aborted', 'AbortError')
                }

                if (!isRetryableInitialPostError(requestError)) {
                    throw requestError
                }

                const decision = resolveStreamReconnectDecision({
                    attempt,
                    elapsedMs: Date.now() - retryStartedAtMs,
                    policy: initialPostRetryPolicy,
                })

                if (!decision.retry) {
                    setStreamRecoveryStatus('recovery_unavailable')
                    throw createUnconfirmedInitialPostError()
                }

                attempt = decision.attempt
                setStreamRecoveryStatus('reconnecting')
                await waitForReconnectDelay(decision.delayMs, controller.signal)
            }
        }

        throw new DOMException('Request aborted', 'AbortError')
    }

    async function submitTurn(
        baseMessages: MindMessage[],
        input: string,
        composer?: ChatComposerPayload,
        displaySegments?: ChatComposerDisplaySegment[]
    ) {
        const text = resolveComposerSubmissionText(input, composer)
        const requestConversationId = conversationId
        const shouldCreateConversation = draftMode || !requestConversationId

        if (!text || abortControllerRef.current) {
            return false
        }

        if (findPendingAgentInterrupt(messagesRef.current)) {
            return false
        }

        textBuffer.clear()
        setThreadMemoryStatusHint(null)
        // 发送前清理上一轮的空占位或临时消息，保证请求上下文只包含稳定内容。
        const stableBaseMessages = pruneTransientMessages(baseMessages)
        const userMessage = createMessage('user', [createTextPart(text, undefined, displaySegments)], composer)
        const nextMessages = [...stableBaseMessages, userMessage]
        const controller = new AbortController()
        const idempotencyKey = createClientStreamRequestId()

        messagesRef.current = nextMessages
        // 每一轮新请求都从“稳定历史消息 + 当前 user 消息”重新初始化 stream reducer 状态；
        // 否则上一轮 activeStream 的 messageId/partId 可能影响本轮 delta 路由。
        streamMessageStateRef.current = createStreamMessageState(nextMessages)
        setMessages(nextMessages)
        setError(null)
        setImageQuotaError(null)
        setStatus('submitted')
        setStreamRecoveryStatus('idle')
        abortControllerRef.current = controller
        activeStreamRecoveryRef.current = {
            cursor: null,
            idempotencyKey,
            runId: null,
            streamUrl: null,
        }
        activeConversationIdRef.current = requestConversationId ?? '__draft__'

        try {
            const skill = toRequestSkill(skillMode)
            const payload: ChatRequestInput = {
                // composer 是本轮请求的结构化输入补充，后端主输入仍由 messages 中的 plainText 兼容承载。
                ...(composer ? { composer } : {}),
                ...(shouldCreateConversation ? { createConversation: true as const } : { conversationId: requestConversationId! }),
                messages: buildRequestMessages(nextMessages),
                options: {
                    modelId: model,
                    enableReasoning,
                    ...(skill ? { skill } : {}),
                },
            }

            const { contentType, response } = await requestInitialChatResponse(payload, idempotencyKey, controller)

            if (contentType.includes('application/json')) {
                const responseJson = await response.json().catch(() => null)

                if (!isStreamReplayDescriptor(responseJson)) {
                    throw new Error('聊天请求返回了无法识别的 JSON 响应。')
                }

                activeStreamRecoveryRef.current = {
                    cursor:
                        activeStreamRecoveryRef.current?.cursor?.runId === responseJson.runId
                            ? activeStreamRecoveryRef.current.cursor
                            : {
                                  eventId: '',
                                  lastAcknowledgedSequence: 0,
                                  protocolVersion: 1,
                                  runId: responseJson.runId,
                              },
                    idempotencyKey,
                    runId: responseJson.runId,
                    streamUrl: responseJson.streamUrl,
                }
                setStreamRecoveryStatus('reconnecting')
                try {
                    await consumeRecoveryGet(responseJson.streamUrl, controller)
                } catch (streamError) {
                    if (
                        !controller.signal.aborted &&
                        activeStreamRecoveryRef.current?.streamUrl &&
                        !activeStreamRecoveryRef.current.terminal &&
                        !activeStreamRecoveryRef.current.paused &&
                        !isAbortError(streamError)
                    ) {
                        setStreamRecoveryStatus('disconnected')
                        await recoverActiveStream(controller)
                    } else {
                        throw streamError
                    }
                }

                if (!controller.signal.aborted) {
                    setStatus('ready')
                    commitStableLocalSnapshot(messagesRef.current, activeConversationIdRef.current ?? requestConversationId)
                }

                return true
            }

            if (!response.body) {
                throw new Error('响应缺少可读取的流式内容。')
            }

            const promotedConversationId = response.headers.get('X-AI-Mind-Conversation-Id')?.trim() || null
            const runId = response.headers.get('X-Run-Id')?.trim() || null

            if (runId) {
                const existingRecovery = activeStreamRecoveryRef.current

                activeStreamRecoveryRef.current = {
                    cursor: existingRecovery?.cursor ?? null,
                    idempotencyKey,
                    runId,
                    streamUrl: `/api/chat/runs/${encodeURIComponent(runId)}/stream`,
                }
            }

            if (shouldCreateConversation) {
                if (!promotedConversationId) {
                    throw new Error('新会话创建失败，请稍后重试。')
                }

                activeConversationIdRef.current = promotedConversationId
                hydratedConversationIdRef.current = promotedConversationId
                void Promise.resolve(options.onConversationPromoted?.(promotedConversationId)).catch(() => undefined)
            }

            setStatus('streaming')
            setStreamRecoveryStatus(runId ? 'connected' : 'idle')
            // consumeNdjsonStream 会持续回调 handleChunk，把协议事件增量转换成前端消息部件。
            try {
                await consumeRecoverableStream(response.body, controller)
            } catch (streamError) {
                if (
                    !controller.signal.aborted &&
                    activeStreamRecoveryRef.current?.streamUrl &&
                    !activeStreamRecoveryRef.current.terminal &&
                    !activeStreamRecoveryRef.current.paused &&
                    !isAbortError(streamError)
                ) {
                    setStreamRecoveryStatus('disconnected')
                    await recoverActiveStream(controller)
                } else {
                    throw streamError
                }
            }

            if (!controller.signal.aborted) {
                setStatus('ready')
                commitStableLocalSnapshot(messagesRef.current, activeConversationIdRef.current ?? requestConversationId)
            }
        } catch (requestError) {
            // 异常前先 flush，避免最后一批已经收到的文本还停留在 buffer 中。
            textBuffer.flush()

            if (isAbortError(requestError)) {
                finalizeAbortedAssistantMessage()
                setStatus('ready')
                return true
            }

            const errorMessage = (requestError as ChatRequestError).userMessage ?? getErrorMessage(requestError)

            if (
                (composer?.command?.name === 'image' || /^\s*\/image(?=\s|$)/u.test(input)) &&
                (requestError as ChatRequestError).code === 'MODEL_PROVIDER_RATE_LIMITED'
            ) {
                setImageQuotaError(errorMessage)
            }

            surfaceAssistantErrorReply(errorMessage)
            setStatus('ready')
        } finally {
            // finish、error、abort 都会走 finally，再兜底 flush 一次，保证不会丢尾字符。
            textBuffer.flush()

            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
            }

            if (
                activeConversationIdRef.current === requestConversationId ||
                (shouldCreateConversation && activeConversationIdRef.current !== conversationId)
            ) {
                activeConversationIdRef.current = null
            }
        }

        return true
    }

    async function sendMessage(input: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        return submitTurn(messagesRef.current, input, composer, displaySegments)
    }

    function retryHydration() {
        if (!conversationId || draftMode || status === 'submitted' || status === 'streaming') {
            return false
        }

        hydratedConversationIdRef.current = null
        setHydrationRetryToken(current => current + 1)
        return true
    }

    async function resumeAgentRun(decision: unknown) {
        const pendingInterrupt = findPendingAgentInterrupt(messagesRef.current)

        if (!pendingInterrupt || abortControllerRef.current || status === 'submitted' || status === 'streaming') {
            return false
        }

        const controller = new AbortController()
        const runId = pendingInterrupt.part.runId
        const previousRecovery = activeStreamRecoveryRef.current
        const previousCursor = previousRecovery?.cursor?.runId === runId ? previousRecovery.cursor : null

        textBuffer.clear()
        setThreadMemoryStatusHint(null)
        setError(null)
        setStatus('submitted')
        setStreamRecoveryStatus('reconnecting')
        abortControllerRef.current = controller
        activeStreamRecoveryRef.current = {
            cursor: previousCursor ?? { eventId: '', lastAcknowledgedSequence: 0, protocolVersion: 1, runId },
            idempotencyKey: previousRecovery?.idempotencyKey ?? createClientStreamRequestId(),
            runId,
            streamUrl: `/api/chat/runs/${encodeURIComponent(runId)}/stream`,
        }

        try {
            const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}/resume`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    decision,
                    interruptId: pendingInterrupt.part.interruptId,
                }),
                signal: controller.signal,
            })

            if (!response.ok) {
                const responseJson = await response.json().catch(() => null)
                const errorMessage = responseJson?.error ?? `恢复 AgentRun 失败，状态码：${response.status}`
                const errorCode = typeof responseJson?.code === 'string' ? responseJson.code : null
                const userMessage = getResumeAgentRunUserMessage(errorCode, errorMessage, response.status)
                const requestError = new Error(errorCode ? `${userMessage}（${errorCode}）` : userMessage) as ChatRequestError

                requestError.code = errorCode ?? undefined
                requestError.userMessage = userMessage
                throw requestError
            }

            if (!response.body) {
                throw new Error('恢复响应缺少可读取的流式内容。')
            }

            setStatus('streaming')
            setStreamRecoveryStatus('connected')
            try {
                await consumeRecoverableStream(response.body, controller)
            } catch (streamError) {
                if (
                    !controller.signal.aborted &&
                    activeStreamRecoveryRef.current?.streamUrl &&
                    !activeStreamRecoveryRef.current.terminal &&
                    !isAbortError(streamError)
                ) {
                    setStreamRecoveryStatus('disconnected')
                    await recoverActiveStream(controller)
                } else {
                    throw streamError
                }
            }

            if (!controller.signal.aborted) {
                setStatus('ready')
                commitStableLocalSnapshot(messagesRef.current)
            }

            return true
        } catch (resumeError) {
            textBuffer.flush()

            if (isAbortError(resumeError)) {
                setStatus('ready')
                return false
            }

            const currentPendingInterrupt = findPendingAgentInterrupt(messagesRef.current)
            const userMessage = (resumeError as ChatRequestError).userMessage ?? getErrorMessage(resumeError)

            surfaceAssistantErrorReply(userMessage, {
                preservePausedStatus: Boolean(currentPendingInterrupt),
                targetMessageId: currentPendingInterrupt?.messageId ?? pendingInterrupt.messageId,
            })
            setStatus('ready')
            setError(userMessage)
            throw resumeError
        } finally {
            textBuffer.flush()

            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
            }
        }
    }

    function cancel() {
        if (!abortControllerRef.current) {
            return
        }

        const runId = activeStreamRecoveryRef.current?.runId

        setStreamRecoveryStatus('cancel_requested')
        abortControllerRef.current.abort()

        if (runId) {
            void fetch(`/api/chat/runs/${encodeURIComponent(runId)}/cancel`, {
                method: 'POST',
            })
                .then(async response => {
                    const responseJson = await response.json().catch(() => null)

                    if (!response.ok) {
                        setStreamRecoveryStatus('recovery_unavailable')
                        setError(responseJson?.error ?? '取消请求失败，请稍后重试。')
                        return
                    }

                    setStreamRecoveryStatus(responseJson?.status === 'cancelled' ? 'terminal' : 'cancel_requested')
                })
                .catch(() => {
                    setStreamRecoveryStatus('recovery_unavailable')
                    setError('取消请求失败，请稍后重试。')
                })
        }
    }

    function deleteUserTurn(userMessageId: string) {
        if (status === 'submitted' || status === 'streaming' || findPendingAgentInterrupt(messagesRef.current)) {
            return false
        }

        // 删除一轮用户消息时，同时删除它后面对应的 assistant 回答，保持回合结构完整。
        updateMessages(current => {
            const nextMessages = removeUserTurnPair(pruneTransientMessages(current), userMessageId)

            commitStableLocalSnapshot(nextMessages)
            return nextMessages
        })
        return true
    }

    async function regenerateLastTurn() {
        if (status === 'submitted' || status === 'streaming' || findPendingAgentInterrupt(messagesRef.current)) {
            return false
        }

        const lastTurn = getLastUserTurnForRegeneration(messagesRef.current)

        if (!lastTurn) {
            return false
        }

        // 重新生成复用上一条用户输入和结构化 composer 信息，但丢弃原 assistant 回答。
        return submitTurn(lastTurn.baseMessages, lastTurn.userText, lastTurn.composer, lastTurn.displaySegments)
    }

    return {
        messages,
        status,
        error,
        imageQuotaError,
        hydrationError,
        hydrationStatus,
        readOnlyCacheMessage,
        streamRecoveryStatus,
        threadMemoryStatusHint,
        pendingInterrupt: findPendingAgentInterrupt(messages),
        sendMessage,
        retryHydration,
        resumeAgentRun,
        cancel,
        deleteUserTurn,
        regenerateLastTurn,
    }
}
