'use client'

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { useEffect, useRef, useState } from 'react'

import { resolveComposerSubmissionText } from '@/lib/ai/composer-submission'
import { createId } from '@/lib/ai/create-id'
import { isAbortError } from '@/lib/ai/error-utils'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import type { ChatComposerDisplaySegment, ChatComposerPayload, ChatRequest, ChatSkillMode, ChatStatus } from '@/lib/ai/types/chat'
import type { MindMessage } from '@/lib/ai/types/message'

import {
    createAssistantPlaceholder,
    createMessage,
    createPromptPart,
    createReasoningPart,
    createResourcePart,
    createSkillPart,
    createTextPart,
    createToolPart,
} from './chat-stream/message-factory'
import {
    appendPart,
    getLastUserTurnForRegeneration,
    pruneTransientMessages,
    removeMessage,
    removeUserTurnPair,
    updatePromptPart,
    updateResourcePart,
    updateToolPart,
    upsertAgentStepPart,
} from './chat-stream/message-operations'
import { buildRequestMessages, toRequestSkill } from './chat-stream/request-message-builder'
import { consumeNdjsonStream } from './chat-stream/stream-reader'
import { useStreamTextBuffer } from './chat-stream/use-stream-text-buffer'

// 文本/推理 delta 的批量刷新窗口。流式 token 先进入 buffer，再按约 40ms + rAF 合并写入 React state。
// 调大：Markdown 解析和 DOM 更新更少但打字感更钝；调小：更实时但更容易触发渲染/滚动抖动。
const STREAM_TEXT_FLUSH_INTERVAL_MS = 40

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return '请求失败，请稍后重试。'
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
    // 当前正在写入的 assistant message/part 由服务端 stream chunk 驱动，后续 delta 必须精确落到对应 part。
    const activeStreamRef = useRef<{
        messageId: string | null
        textPartId: string | null
        reasoningPartId: string | null
    }>({
        messageId: null,
        textPartId: null,
        reasoningPartId: null,
    })
    function updateMessages(updater: (current: MindMessage[]) => MindMessage[]) {
        setMessages(current => {
            const next = updater(current)
            // 异步提交、取消和重新生成都依赖最新消息快照，ref 与 state 必须同步推进。
            messagesRef.current = next
            return next
        })
    }

    const textBuffer = useStreamTextBuffer({
        flushIntervalMs: STREAM_TEXT_FLUSH_INTERVAL_MS,
        updateMessages,
    })

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    function resetActiveStream() {
        activeStreamRef.current = {
            messageId: null,
            textPartId: null,
            reasoningPartId: null,
        }
    }

    function discardActiveAssistantMessage() {
        const { messageId } = activeStreamRef.current

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

    function beginAssistantMessage(chunk: Extract<ChatStreamChunk, { type: 'start' }>) {
        activeStreamRef.current.messageId = chunk.messageId
        activeStreamRef.current.textPartId = null
        activeStreamRef.current.reasoningPartId = null
        updateMessages(current => [...current, createAssistantPlaceholder(chunk.messageId)])
    }

    function appendSelectedSkill(chunk: Extract<ChatStreamChunk, { type: 'skill-selected' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current => appendPart(current, messageId, createSkillPart(chunk.skillId, chunk.name, chunk.description)))
    }

    function startAgentStep(chunk: Extract<ChatStreamChunk, { type: 'agent-step-start' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            upsertAgentStepPart(
                current,
                messageId,
                {
                    partId: chunk.partId,
                    stepIndex: chunk.stepIndex,
                    actionType: chunk.actionType,
                    title: chunk.title,
                    status: 'running',
                },
                chunk.runId,
                chunk.agentName
            )
        )
    }

    function endAgentStep(chunk: Extract<ChatStreamChunk, { type: 'agent-step-end' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            upsertAgentStepPart(
                current,
                messageId,
                {
                    partId: chunk.partId,
                    stepIndex: chunk.stepIndex,
                    actionType: chunk.actionType,
                    title: chunk.title ?? chunk.actionType,
                    status: chunk.status,
                    summary: chunk.summary,
                    durationMs: chunk.durationMs,
                    severity: chunk.severity,
                    tags: chunk.tags,
                    error: chunk.error,
                },
                chunk.runId,
                chunk.agentName
            )
        )
    }

    function beginTextPart(chunk: Extract<ChatStreamChunk, { type: 'text-start' }>) {
        const messageId = activeStreamRef.current.messageId

        activeStreamRef.current.textPartId = chunk.partId
        if (!messageId) {
            return
        }

        updateMessages(current => appendPart(current, messageId, createTextPart('', chunk.partId)))
    }

    function appendTextDeltaBuffered(chunk: Extract<ChatStreamChunk, { type: 'text-delta' }>) {
        const messageId = activeStreamRef.current.messageId
        const textPartId = activeStreamRef.current.textPartId

        if (!messageId || textPartId !== chunk.partId) {
            return
        }

        textBuffer.enqueue(messageId, chunk.partId, 'text', chunk.delta)
    }

    function beginReasoningPart(chunk: Extract<ChatStreamChunk, { type: 'reasoning-start' }>) {
        const messageId = activeStreamRef.current.messageId

        activeStreamRef.current.reasoningPartId = chunk.partId
        if (!messageId) {
            return
        }

        updateMessages(current => appendPart(current, messageId, createReasoningPart('', chunk.partId)))
    }

    function appendReasoningDeltaBuffered(chunk: Extract<ChatStreamChunk, { type: 'reasoning-delta' }>) {
        const messageId = activeStreamRef.current.messageId
        const reasoningPartId = activeStreamRef.current.reasoningPartId

        if (!messageId || reasoningPartId !== chunk.partId) {
            return
        }

        textBuffer.enqueue(messageId, chunk.partId, 'reasoning', chunk.delta)
    }

    function appendToolCall(chunk: Extract<ChatStreamChunk, { type: 'tool-start' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            appendPart(
                current,
                messageId,
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
        )
    }

    function completeToolCall(chunk: Extract<ChatStreamChunk, { type: 'tool-end' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            updateToolPart(current, messageId, chunk.partId, part => ({
                ...part,
                title: chunk.title ?? part.title,
                action: chunk.action ?? part.action,
                source: chunk.source ?? part.source,
                location: chunk.location ?? part.location,
                serverId: chunk.serverId ?? part.serverId,
                status: 'completed',
                output: chunk.output,
            }))
        )
    }

    function appendPromptInjection(chunk: Extract<ChatStreamChunk, { type: 'prompt-start' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            appendPart(
                current,
                messageId,
                createPromptPart(chunk.partId, chunk.promptName, 'called', chunk.source, chunk.location, chunk.serverId, chunk.input)
            )
        )
    }

    function completePromptInjection(chunk: Extract<ChatStreamChunk, { type: 'prompt-end' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            updatePromptPart(current, messageId, chunk.partId, part => ({
                ...part,
                promptName: chunk.promptName,
                source: chunk.source ?? part.source,
                location: chunk.location ?? part.location,
                serverId: chunk.serverId ?? part.serverId,
                status: chunk.status,
                messageCount: chunk.messageCount,
            }))
        )
    }

    function appendResourceRead(chunk: Extract<ChatStreamChunk, { type: 'resource-start' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            appendPart(
                current,
                messageId,
                createResourcePart(chunk.partId, chunk.resourceName, chunk.uri, chunk.serverId, chunk.source, chunk.location)
            )
        )
    }

    function completeResourceRead(chunk: Extract<ChatStreamChunk, { type: 'resource-end' }>) {
        const messageId = activeStreamRef.current.messageId

        if (!messageId) {
            return
        }

        updateMessages(current =>
            updateResourcePart(current, messageId, chunk.partId, part => ({
                ...part,
                resourceName: chunk.resourceName,
                uri: chunk.uri,
                source: chunk.source ?? part.source,
                location: chunk.location ?? part.location,
                serverId: chunk.serverId,
                status: 'completed',
                contentPreview: chunk.contentPreview,
                isTruncated: chunk.isTruncated,
                previewChars: chunk.previewChars,
            }))
        )
    }

    function finishAssistantMessage() {
        updateMessages(current => pruneTransientMessages(current))
        resetActiveStream()
    }

    function handleStreamPartError(chunk: Extract<ChatStreamChunk, { type: 'error' }>) {
        const messageId = activeStreamRef.current.messageId

        // 统一错误协议下，tool/resource 错误走部件更新，runtime/request 错误走全局失败。
        if (chunk.scope === 'tool') {
            if (!messageId || !chunk.partId) {
                return
            }

            updateMessages(current =>
                updateToolPart(current, messageId, chunk.partId, part => ({
                    ...part,
                    toolName: chunk.toolName ?? part.toolName,
                    source: chunk.source ?? part.source,
                    location: chunk.location ?? part.location,
                    serverId: chunk.serverId ?? part.serverId,
                    input: chunk.input ?? part.input,
                    status: 'failed',
                    error: chunk.message,
                }))
            )
            return
        }

        if (chunk.scope === 'resource') {
            if (!messageId || !chunk.partId) {
                return
            }

            updateMessages(current =>
                updateResourcePart(current, messageId, chunk.partId, part => ({
                    ...part,
                    resourceName: chunk.resourceName ?? part.resourceName,
                    uri: chunk.uri ?? part.uri,
                    source: chunk.source ?? part.source,
                    location: chunk.location ?? part.location,
                    serverId: chunk.serverId ?? part.serverId,
                    status: 'failed',
                    error: chunk.message,
                }))
            )
            return
        }

        if (chunk.scope === 'prompt') {
            if (!messageId || !chunk.partId) {
                return
            }

            updateMessages(current =>
                updatePromptPart(current, messageId, chunk.partId, part => ({
                    ...part,
                    source: chunk.source ?? part.source,
                    location: chunk.location ?? part.location,
                    serverId: chunk.serverId ?? part.serverId,
                    promptName: chunk.promptName ?? part.promptName,
                    status: 'failed',
                    error: chunk.message,
                }))
            )
            return
        }

        throw new Error(chunk.message)
    }

    function handleChunk(chunk: ChatStreamChunk) {
        if (chunk.type !== 'text-delta' && chunk.type !== 'reasoning-delta') {
            // 结构性 chunk 到来前先落地文本，避免卡片/结束事件插到尚未 flush 的正文前面。
            textBuffer.flush()
        }

        switch (chunk.type) {
            case 'start':
                beginAssistantMessage(chunk)
                return
            case 'skill-selected':
                appendSelectedSkill(chunk)
                return
            case 'agent-step-start':
                startAgentStep(chunk)
                return
            case 'agent-step-end':
                endAgentStep(chunk)
                return
            case 'text-start':
                beginTextPart(chunk)
                return
            case 'text-delta':
                appendTextDeltaBuffered(chunk)
                return
            case 'reasoning-start':
                beginReasoningPart(chunk)
                return
            case 'reasoning-delta':
                appendReasoningDeltaBuffered(chunk)
                return
            case 'tool-start':
                appendToolCall(chunk)
                return
            case 'tool-end':
                completeToolCall(chunk)
                return
            case 'prompt-start':
                appendPromptInjection(chunk)
                return
            case 'prompt-end':
                completePromptInjection(chunk)
                return
            case 'resource-start':
                appendResourceRead(chunk)
                return
            case 'resource-end':
                completeResourceRead(chunk)
                return
            case 'text-end':
            case 'reasoning-end':
                return
            case 'finish':
                finishAssistantMessage()
                return
            case 'error':
                handleStreamPartError(chunk)
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
                    model,
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
                throw new Error(errorCode ? `${errorMessage}（${errorCode}）` : errorMessage)
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
            updateMessages(current => pruneTransientMessages(current))
            setError(getErrorMessage(requestError))
            setStatus('error')
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
