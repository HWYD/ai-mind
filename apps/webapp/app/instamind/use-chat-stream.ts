'use client'

import { useEffect, useRef, useState } from 'react'

import { chatStreamChunkSchema } from '../../lib/ai/stream-chunk-schema'
import type { ChatRequest, ChatStatus, MindMessageInput } from '../../lib/ai/types/chat'
import type { MindMessage, MindMessagePart, MindRole, ReasoningPart, TextPart } from '../../lib/ai/types/message'
import type { ChatStreamChunk } from '../../lib/ai/types/stream-chunk'

const DEFAULT_MODEL = 'qwen3:4b'

function createTextPart(text: string): TextPart {
    return {
        type: 'text',
        text,
        format: 'markdown',
    }
}

function createReasoningPart(text: string): ReasoningPart {
    return {
        type: 'reasoning',
        text,
        format: 'markdown',
        visibility: 'collapsed',
    }
}

function createMessage(role: MindRole, parts: MindMessagePart[]): MindMessage {
    return {
        id: crypto.randomUUID(),
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

function toMessageInput(message: MindMessage): MindMessageInput {
    return {
        role: message.role,
        parts: message.parts.filter((part): part is MindMessageInput['parts'][number] => part.type === 'text'),
    }
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

function appendPartDelta(messages: MindMessage[], messageId: string, partType: MindMessagePart['type'], delta: string): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const parts = [...message.parts]
        const lastIndex = parts.length - 1
        const lastPart = parts[lastIndex]

        if (!lastPart || lastPart.type !== partType) {
            const nextPart = partType === 'reasoning' ? createReasoningPart(delta) : createTextPart(delta)

            return {
                ...message,
                parts: [...message.parts, nextPart],
            }
        }

        parts[lastIndex] = {
            ...lastPart,
            text: lastPart.text + delta,
        }

        return {
            ...message,
            parts,
        }
    })
}

function removeMessage(messages: MindMessage[], messageId: string | null): MindMessage[] {
    if (!messageId) {
        return messages
    }

    return messages.filter(message => message.id !== messageId)
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return 'Chat request failed.'
}

function isAbortError(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

async function consumeNdjsonStream(stream: ReadableStream<Uint8Array>, onChunk: (chunk: ChatStreamChunk) => void) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // 按行读取自定义 NDJSON 协议，这样前端可以一边接收一边合并消息片段。
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
                throw new Error('Invalid chat stream chunk.')
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
        throw new Error('Invalid chat stream chunk.')
    }

    onChunk(parsedChunk.data)
}

export function useChatStream() {
    const [messages, setMessages] = useState<MindMessage[]>([])
    const [status, setStatus] = useState<ChatStatus>('ready')
    const [error, setError] = useState<string | null>(null)

    const messagesRef = useRef(messages)
    const conversationIdRef = useRef(crypto.randomUUID())
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
            case 'start':
                activeStreamRef.current.messageId = chunk.messageId
                activeStreamRef.current.textPartId = null
                activeStreamRef.current.reasoningPartId = null
                updateMessages(current => [...current, createAssistantPlaceholder(chunk.messageId)])
                return
            case 'text-start':
                activeStreamRef.current.textPartId = chunk.partId
                updateMessages(current => appendPart(current, activeStreamRef.current.messageId ?? '', createTextPart('')))
                return
            case 'text-delta':
                if (activeStreamRef.current.textPartId !== chunk.partId) {
                    return
                }

                updateMessages(current => appendPartDelta(current, activeStreamRef.current.messageId ?? '', 'text', chunk.delta))
                return
            case 'reasoning-start':
                activeStreamRef.current.reasoningPartId = chunk.partId
                updateMessages(current => appendPart(current, activeStreamRef.current.messageId ?? '', createReasoningPart('')))
                return
            case 'reasoning-delta':
                if (activeStreamRef.current.reasoningPartId !== chunk.partId) {
                    return
                }

                updateMessages(current => appendPartDelta(current, activeStreamRef.current.messageId ?? '', 'reasoning', chunk.delta))
                return
            case 'text-end':
            case 'reasoning-end':
                return
            case 'finish':
                resetActiveStream()
                return
            case 'error':
                throw new Error(chunk.message)
        }
    }

    async function sendMessage(input: string) {
        const text = input.trim()

        if (!text || abortControllerRef.current) {
            return false
        }

        const userMessage = createMessage('user', [createTextPart(text)])
        const nextMessages = [...messagesRef.current, userMessage]
        const controller = new AbortController()

        messagesRef.current = nextMessages
        setMessages(nextMessages)
        setError(null)
        setStatus('submitted')
        abortControllerRef.current = controller

        try {
            const payload: ChatRequest = {
                conversationId: conversationIdRef.current,
                messages: nextMessages.map(toMessageInput),
                options: {
                    model: DEFAULT_MODEL,
                    enableReasoning: true,
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
                throw new Error(responseJson?.error ?? `Chat request failed with status ${response.status}.`)
            }

            if (!response.body) {
                throw new Error('Chat response stream is unavailable.')
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
            setError(getErrorMessage(requestError))
            setStatus('error')
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null
            }
        }

        return true
    }

    function cancel() {
        if (!abortControllerRef.current) {
            return
        }

        abortControllerRef.current.abort()
    }

    return {
        messages,
        status,
        error,
        sendMessage,
        cancel,
    }
}
