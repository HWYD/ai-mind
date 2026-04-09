'use client'

import { useEffect, useRef, useState } from 'react'

import { createId } from '@/lib/ai/create-id'
import { type ChatModel, defaultChatModel } from '@/lib/ai/models'
import { chatStreamChunkSchema } from '@/lib/ai/stream-chunk-schema'
import type { ChatRequest, ChatSkillMode, ChatStatus, MindMessageInput } from '@/lib/ai/types/chat'
import type { MindMessage, MindMessagePart, MindRole, ReasoningPart, ResourcePart, TextPart, ToolPart } from '@/lib/ai/types/message'
import type { ChatStreamChunk } from '@/lib/ai/types/stream-chunk'

const MAX_CONTEXT_TURNS = 8

function createTextPart(text: string, id?: string): TextPart {
    return {
        id,
        type: 'text',
        text,
        format: 'markdown',
    }
}

function createReasoningPart(text: string, id?: string): ReasoningPart {
    return {
        id,
        type: 'reasoning',
        text,
        format: 'markdown',
        visibility: 'collapsed',
    }
}

function createToolPart(
    partId: string,
    toolName: string,
    input: string,
    title?: string,
    action?: string,
    source?: ToolPart['source'],
    serverId?: string
): ToolPart {
    return {
        id: partId,
        type: 'tool',
        toolName,
        title,
        action,
        source,
        serverId,
        status: 'called',
        input,
    }
}

function createResourcePart(partId: string, resourceName: string, uri: string, serverId: string): ResourcePart {
    return {
        id: partId,
        type: 'resource',
        resourceName,
        uri,
        serverId,
        status: 'loading',
    }
}

function createMessage(role: MindRole, parts: MindMessagePart[]): MindMessage {
    return {
        id: createId(),
        role,
        parts,
        createdAt: new Date().toISOString(),
    }
}

function createAssistantPlaceholder(messageId: string): MindMessage {
    return {
        id: messageId,
        role: 'assistant',
        parts: [],
        createdAt: new Date().toISOString(),
    }
}

function toMessageInput(message: MindMessage): MindMessageInput | null {
    const parts = message.parts.filter(
        (part): part is MindMessageInput['parts'][number] => part.type === 'text' && part.text.trim().length > 0
    )

    if (parts.length === 0) {
        return null
    }

    return {
        role: message.role,
        parts,
    }
}

function pruneTransientMessages(messages: MindMessage[]): MindMessage[] {
    return messages.filter(message => {
        if (message.parts.length === 0) {
            return false
        }

        return message.parts.some(part => {
            if (part.type === 'tool' || part.type === 'resource') {
                return true
            }

            return part.text.trim().length > 0
        })
    })
}

function toRequestMessages(messages: MindMessage[]): MindMessageInput[] {
    return messages.map(toMessageInput).filter((message): message is MindMessageInput => message !== null)
}

function getMessageTextContent(message: MindMessage): string {
    return message.parts
        .filter((part): part is TextPart => part.type === 'text' && part.text.trim().length > 0)
        .map(part => part.text)
        .join('\n\n')
}

function getRecentContextWindow(messages: MindMessage[]): MindMessage[] {
    const systemMessages = messages.filter(message => message.role === 'system')
    const conversationalMessages = messages.filter(message => message.role !== 'system')

    if (conversationalMessages.length === 0) {
        return systemMessages
    }

    const recentMessages: MindMessage[] = []
    let userTurnCount = 0

    for (let index = conversationalMessages.length - 1; index >= 0; index -= 1) {
        const message = conversationalMessages[index]
        recentMessages.unshift(message)

        if (message.role === 'user') {
            userTurnCount += 1

            if (userTurnCount >= MAX_CONTEXT_TURNS) {
                break
            }
        }
    }

    return [...systemMessages, ...recentMessages]
}

function buildRequestMessages(messages: MindMessage[]): MindMessageInput[] {
    return toRequestMessages(getRecentContextWindow(messages))
}

function appendPart(messages: MindMessage[], messageId: string, part: MindMessagePart): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: [...message.parts, part],
        }
    })
}

// 通过 partId 精确追加文本增量，避免并发流式更新时把内容拼到错误的 part 中。
function appendTextualPartDelta(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    partType: 'text' | 'reasoning',
    delta: string
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const parts = [...message.parts]
        const targetIndex = parts.findIndex(part => part.id === partId && part.type === partType)

        if (targetIndex === -1) {
            const nextPart = partType === 'reasoning' ? createReasoningPart(delta, partId) : createTextPart(delta, partId)

            return {
                ...message,
                parts: [...message.parts, nextPart],
            }
        }

        const targetPart = parts[targetIndex]

        if (targetPart.type !== partType) {
            return message
        }

        parts[targetIndex] = {
            ...targetPart,
            text: targetPart.text + delta,
        }

        return {
            ...message,
            parts,
        }
    })
}

function updateToolPart(messages: MindMessage[], messageId: string, partId: string, updater: (part: ToolPart) => ToolPart): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'tool' || part.id !== partId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

function updateResourcePart(
    messages: MindMessage[],
    messageId: string,
    partId: string,
    updater: (part: ResourcePart) => ResourcePart
): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: message.parts.map(part => {
                if (part.type !== 'resource' || part.id !== partId) {
                    return part
                }

                return updater(part)
            }),
        }
    })
}

function removeMessage(messages: MindMessage[], messageId: string | null): MindMessage[] {
    if (!messageId) {
        return messages
    }

    return messages.filter(message => message.id !== messageId)
}

function removeUserTurnPair(messages: MindMessage[], userMessageId: string): MindMessage[] {
    const userMessageIndex = messages.findIndex(message => message.id === userMessageId && message.role === 'user')

    if (userMessageIndex === -1) {
        return messages
    }

    const messageIdsToRemove = new Set<string>([userMessageId])

    for (let index = userMessageIndex + 1; index < messages.length; index += 1) {
        const message = messages[index]

        if (message.role === 'user') {
            break
        }

        if (message.role === 'assistant') {
            messageIdsToRemove.add(message.id)
            break
        }
    }

    return messages.filter(message => !messageIdsToRemove.has(message.id))
}

function getLastUserTurnForRegeneration(messages: MindMessage[]) {
    const stableMessages = pruneTransientMessages(messages)
    let lastUserIndex = -1

    for (let index = stableMessages.length - 1; index >= 0; index -= 1) {
        if (stableMessages[index].role === 'user') {
            lastUserIndex = index
            break
        }
    }

    if (lastUserIndex === -1) {
        return null
    }

    const lastUserMessage = stableMessages[lastUserIndex]
    const userText = getMessageTextContent(lastUserMessage).trim()
    const hasAssistantAfterUser = stableMessages.slice(lastUserIndex + 1).some(message => message.role === 'assistant')

    if (!userText || !hasAssistantAfterUser) {
        return null
    }

    return {
        baseMessages: stableMessages.slice(0, lastUserIndex),
        userText,
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return '请求失败，请稍后重试。'
}

function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

async function consumeNdjsonStream(stream: ReadableStream<Uint8Array>, onChunk: (chunk: ChatStreamChunk) => void) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // 按 NDJSON 协议逐行消费流，避免把半截 JSON 提前交给解析层。
    while (true) {
        const { done, value } = await reader.read()

        if (done) {
            break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
            const trimmedLine = line.trim()

            if (!trimmedLine) {
                continue
            }

            const parsedChunk = chatStreamChunkSchema.safeParse(JSON.parse(trimmedLine))

            if (!parsedChunk.success) {
                throw new Error('服务端返回了无法解析的流式数据。')
            }

            onChunk(parsedChunk.data)
        }
    }

    const finalLine = buffer.trim()

    if (!finalLine) {
        return
    }

    const parsedChunk = chatStreamChunkSchema.safeParse(JSON.parse(finalLine))

    if (!parsedChunk.success) {
        throw new Error('服务端返回了无法解析的流式数据。')
    }

    onChunk(parsedChunk.data)
}

function toRequestSkill(skillMode: ChatSkillMode) {
    switch (skillMode) {
        case 'utility':
            return 'utility-skill'
        case 'reader':
            return 'reader-skill'
        default:
            return undefined
    }
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
    const activeStreamRef = useRef<{
        messageId: string | null
        textPartId: string | null
        reasoningPartId: string | null
    }>({
        messageId: null,
        textPartId: null,
        reasoningPartId: null,
    })

    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    function updateMessages(updater: (current: MindMessage[]) => MindMessage[]) {
        setMessages(current => {
            const next = updater(current)
            messagesRef.current = next
            return next
        })
    }

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

        updateMessages(current => removeMessage(current, messageId))
        resetActiveStream()
    }

    function handleChunk(chunk: ChatStreamChunk) {
        switch (chunk.type) {
            case 'start': {
                activeStreamRef.current.messageId = chunk.messageId
                activeStreamRef.current.textPartId = null
                activeStreamRef.current.reasoningPartId = null
                updateMessages(current => [...current, createAssistantPlaceholder(chunk.messageId)])
                return
            }
            case 'text-start': {
                const messageId = activeStreamRef.current.messageId

                activeStreamRef.current.textPartId = chunk.partId
                if (!messageId) {
                    return
                }

                updateMessages(current => appendPart(current, messageId, createTextPart('', chunk.partId)))
                return
            }
            case 'text-delta': {
                const messageId = activeStreamRef.current.messageId
                const textPartId = activeStreamRef.current.textPartId

                if (!messageId || textPartId !== chunk.partId) {
                    return
                }

                updateMessages(current => appendTextualPartDelta(current, messageId, chunk.partId, 'text', chunk.delta))
                return
            }
            case 'reasoning-start': {
                const messageId = activeStreamRef.current.messageId

                activeStreamRef.current.reasoningPartId = chunk.partId
                if (!messageId) {
                    return
                }

                updateMessages(current => appendPart(current, messageId, createReasoningPart('', chunk.partId)))
                return
            }
            case 'reasoning-delta': {
                const messageId = activeStreamRef.current.messageId
                const reasoningPartId = activeStreamRef.current.reasoningPartId

                if (!messageId || reasoningPartId !== chunk.partId) {
                    return
                }

                updateMessages(current => appendTextualPartDelta(current, messageId, chunk.partId, 'reasoning', chunk.delta))
                return
            }
            case 'tool-start': {
                const messageId = activeStreamRef.current.messageId

                if (!messageId) {
                    return
                }

                updateMessages(current =>
                    appendPart(
                        current,
                        messageId,
                        createToolPart(chunk.partId, chunk.toolName, chunk.input, chunk.title, chunk.action, chunk.source, chunk.serverId)
                    )
                )
                return
            }
            case 'tool-end': {
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
                        serverId: chunk.serverId ?? part.serverId,
                        status: 'completed',
                        output: chunk.output,
                    }))
                )
                return
            }
            case 'tool-error': {
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
                        serverId: chunk.serverId ?? part.serverId,
                        status: 'failed',
                        error: chunk.message,
                    }))
                )
                return
            }
            case 'resource-start': {
                const messageId = activeStreamRef.current.messageId

                if (!messageId) {
                    return
                }

                updateMessages(current =>
                    appendPart(current, messageId, createResourcePart(chunk.partId, chunk.resourceName, chunk.uri, chunk.serverId))
                )
                return
            }
            case 'resource-end': {
                const messageId = activeStreamRef.current.messageId

                if (!messageId) {
                    return
                }

                updateMessages(current =>
                    updateResourcePart(current, messageId, chunk.partId, part => ({
                        ...part,
                        resourceName: chunk.resourceName,
                        uri: chunk.uri,
                        serverId: chunk.serverId,
                        status: 'completed',
                        contentPreview: chunk.contentPreview,
                        isTruncated: chunk.isTruncated,
                        previewChars: chunk.previewChars,
                    }))
                )
                return
            }
            case 'resource-error': {
                const messageId = activeStreamRef.current.messageId

                if (!messageId) {
                    return
                }

                updateMessages(current =>
                    updateResourcePart(current, messageId, chunk.partId, part => ({
                        ...part,
                        resourceName: chunk.resourceName,
                        uri: chunk.uri,
                        serverId: chunk.serverId,
                        status: 'failed',
                        error: chunk.message,
                    }))
                )
                return
            }
            case 'text-end':
            case 'reasoning-end':
                return
            case 'finish':
                updateMessages(current => pruneTransientMessages(current))
                resetActiveStream()
                return
            case 'error':
                throw new Error(chunk.message)
        }
    }

    async function submitTurn(baseMessages: MindMessage[], input: string) {
        const text = input.trim()

        if (!text || abortControllerRef.current) {
            return false
        }

        const stableBaseMessages = pruneTransientMessages(baseMessages)
        const userMessage = createMessage('user', [createTextPart(text)])
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
                throw new Error(responseJson?.error ?? `聊天请求失败，状态码：${response.status}`)
            }

            if (!response.body) {
                throw new Error('响应缺少可读取的流式内容。')
            }

            setStatus('streaming')
            await consumeNdjsonStream(response.body, handleChunk)

            if (!controller.signal.aborted) {
                setStatus('ready')
            }
        } catch (requestError) {
            if (isAbortError(requestError)) {
                discardActiveAssistantMessage()
                setStatus('ready')
                return true
            }

            discardActiveAssistantMessage()
            updateMessages(current => pruneTransientMessages(current))
            setError(getErrorMessage(requestError))
            setStatus('error')
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
            }
        }

        return true
    }

    async function sendMessage(input: string) {
        return submitTurn(messagesRef.current, input)
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

        return submitTurn(lastTurn.baseMessages, lastTurn.userText)
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
