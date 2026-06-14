'use client'

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { useEffect, useRef, useState } from 'react'

import { resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { createId } from '@/lib/ai/create-id'
import { isAbortError } from '@/lib/ai/error-utils'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatRequest, ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

import { createMessage, createTextPart } from './chat-stream/message-factory'
import { getLastUserTurnForRegeneration, pruneTransientMessages, removeMessage, removeUserTurnPair } from './chat-stream/message-operations'
import { buildRequestMessages, toRequestSkill } from './chat-stream/request-message-builder'
import {
    createInitialActiveStreamState,
    createStreamMessageState,
    reduceStreamChunk,
    reduceStreamTextDeltas,
    type StreamMessageReducerResult,
    type StreamMessageState,
} from './chat-stream/stream-message-reducer'
import { consumeNdjsonStream } from './chat-stream/stream-reader'
import { useStreamTextBuffer } from './chat-stream/use-stream-text-buffer'

// 文本/推理 delta 的批量刷新窗口。流式 token 先进入 buffer，再按约 40ms + rAF 合并写入 React state。
// 调大：Markdown 解析和 DOM 更新更少但打字感更钝；调小：更实时但更容易触发渲染/滚动抖动。
const STREAM_TEXT_FLUSH_INTERVAL_MS = 40

type ChatRequestError = Error & {
    code?: string
    userMessage?: string
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return '请求失败，请稍后重试。'
}

function getErrorCode(error: unknown): string | null {
    if (!(error instanceof Error) || !('code' in error)) {
        return null
    }

    return typeof error.code === 'string' ? error.code : null
}

interface UseChatStreamOptions {
    skillMode?: ChatSkillMode
    model?: ChatModel
    enableReasoning?: boolean
}

export function useChatStream(options: UseChatStreamOptions = {}) {
    const skillMode = options.skillMode ?? 'auto'
    const model = options.model ?? defaultChatModel
    const enableReasoning = options.enableReasoning ?? true

    const [messages, setMessages] = useState<MindMessage[]>([])
    const [status, setStatus] = useState<ChatStatus>('ready')
    const [error, setError] = useState<string | null>(null)

    const messagesRef = useRef(messages)
    const conversationIdRef = useRef(createId())
    const abortControllerRef = useRef<AbortController | null>(null)

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
        updateMessages(current => removeMessage(current, messageId))
        resetActiveStream()
    }

    function finalizeAbortedAssistantMessage() {
        // 用户主动中止时，保留已经收到的正文 / 推理 / 工具卡片，只清掉空占位消息，
        // 避免前端把“已看到的半截回答”整条删除。
        textBuffer.clear()
        updateMessages(current => pruneTransientMessages(current))
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
            default:
                // 结构性 chunk 统一交给 reducer：start/tool/resource/prompt/artifact/error/finish 等消息树变化都在一个入口收口。
                commitStreamReduction(current => reduceStreamChunk(current, chunk))
                return
        }
    }

    async function submitTurn(
        baseMessages: MindMessage[],
        input: string,
        composer?: ChatComposerPayload,
        displaySegments?: ChatComposerDisplaySegment[]
    ) {
        const text = resolveComposerSubmissionText(input, composer)

        if (!text || abortControllerRef.current) {
            return false
        }

        textBuffer.clear()
        // 发送前清理上一轮的空占位或临时消息，保证请求上下文只包含稳定内容。
        const stableBaseMessages = pruneTransientMessages(baseMessages)
        const userMessage = createMessage('user', [createTextPart(text, undefined, displaySegments)], composer)
        const nextMessages = [...stableBaseMessages, userMessage]
        const controller = new AbortController()

        messagesRef.current = nextMessages
        // 每一轮新请求都从“稳定历史消息 + 当前 user 消息”重新初始化 stream reducer 状态；
        // 否则上一轮 activeStream 的 messageId/partId 可能影响本轮 delta 路由。
        streamMessageStateRef.current = createStreamMessageState(nextMessages)
        setMessages(nextMessages)
        setError(null)
        setStatus('submitted')
        abortControllerRef.current = controller

        try {
            const skill = toRequestSkill(skillMode)
            const payload: ChatRequest = {
                conversationId: conversationIdRef.current,
                // composer 是本轮请求的结构化输入补充，后端主输入仍由 messages 中的 plainText 兼容承载。
                ...(composer ? { composer } : {}),
                messages: buildRequestMessages(nextMessages),
                options: {
                    modelId: model,
                    enableReasoning,
                    ...(skill ? { skill } : {}),
                },
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            })
            if (!response.ok) {
                const responseJson = await response.json().catch(() => null)
                const errorMessage = responseJson?.error ?? `聊天请求失败，状态码：${response.status}`
                const errorCode = typeof responseJson?.code === 'string' ? responseJson.code : null
                const requestError = new Error(errorCode ? `${errorMessage}（${errorCode}）` : errorMessage) as ChatRequestError
                requestError.code = errorCode ?? undefined
                requestError.userMessage = errorMessage
                throw requestError
            }

            if (!response.body) {
                throw new Error('响应缺少可读取的流式内容。')
            }

            setStatus('streaming')
            // consumeNdjsonStream 会持续回调 handleChunk，把协议事件增量转换成前端消息部件。
            await consumeNdjsonStream(response.body, handleChunk)

            if (!controller.signal.aborted) {
                setStatus('ready')
            }
        } catch (requestError) {
            // 异常前先 flush，避免最后一批已经收到的文本还停留在 buffer 中。
            textBuffer.flush()

            if (isAbortError(requestError)) {
                finalizeAbortedAssistantMessage()
                setStatus('ready')
                return true
            }

            discardActiveAssistantMessage()
            const requestErrorCode = getErrorCode(requestError)

            if (requestErrorCode === 'MODEL_PROVIDER_RATE_LIMITED') {
                updateMessages(current => [
                    ...pruneTransientMessages(current),
                    createMessage('assistant', [
                        createTextPart((requestError as ChatRequestError).userMessage ?? getErrorMessage(requestError)),
                    ]),
                ])
                setError(null)
                setStatus('ready')
            } else {
                updateMessages(current => pruneTransientMessages(current))
                setError(getErrorMessage(requestError))
                setStatus('error')
            }
        } finally {
            // finish、error、abort 都会走 finally，再兜底 flush 一次，保证不会丢尾字符。
            textBuffer.flush()

            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
            }
        }

        return true
    }

    async function sendMessage(input: string, composer?: ChatComposerPayload, displaySegments?: ChatComposerDisplaySegment[]) {
        return submitTurn(messagesRef.current, input, composer, displaySegments)
    }

    function cancel() {
        if (!abortControllerRef.current) {
            return
        }

        abortControllerRef.current.abort()
    }

    function deleteUserTurn(userMessageId: string) {
        if (status === 'submitted' || status === 'streaming') {
            return false
        }

        // 删除一轮用户消息时，同时删除它后面对应的 assistant 回答，保持回合结构完整。
        updateMessages(current => removeUserTurnPair(pruneTransientMessages(current), userMessageId))
        return true
    }

    async function regenerateLastTurn() {
        if (status === 'submitted' || status === 'streaming') {
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
        sendMessage,
        cancel,
        deleteUserTurn,
        regenerateLastTurn,
    }
}
