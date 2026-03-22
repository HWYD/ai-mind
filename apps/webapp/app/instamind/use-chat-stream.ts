'use client'

import { useEffect, useRef, useState } from 'react'

import { chatStreamChunkSchema } from '../../lib/ai/stream-chunk-schema'
import type { ChatRequest, ChatStatus, MindMessageInput } from '../../lib/ai/types/chat'
import type { MindMessage, MindMessagePart, MindRole, TextPart } from '../../lib/ai/types/message'
import type { ChatStreamChunk } from '../../lib/ai/types/stream-chunk'

const DEFAULT_MODEL = 'qwen3:4b'

function createTextPart(text: string): TextPart {
    return {
        type: 'text',
        text,
        format: 'markdown',
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
        parts: message.parts.filter((part): part is MindMessageInput['parts'][number] => part.type === 'text' || part.type === 'reasoning'),
    }
}

function appendTextPart(messages: MindMessage[], messageId: string): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        return {
            ...message,
            parts: [...message.parts, createTextPart('')],
        }
    })
}

function appendTextDelta(messages: MindMessage[], messageId: string, delta: string): MindMessage[] {
    return messages.map(message => {
        if (message.id !== messageId) {
            return message
        }

        const parts = [...message.parts]
        const lastIndex = parts.length - 1
        const lastPart = parts[lastIndex]

        if (!lastPart || lastPart.type !== 'text') {
            return {
                ...message,
                parts: [...message.parts, createTextPart(delta)],
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
        partId: string | null
    }>({
        messageId: null,
        partId: null,
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
            partId: null,
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
                activeStreamRef.current.partId = null
                updateMessages(current => [...current, createAssistantPlaceholder(chunk.messageId)])
                return
            case 'text-start':
                activeStreamRef.current.partId = chunk.partId
                updateMessages(current => appendTextPart(current, activeStreamRef.current.messageId ?? ''))
                return
            case 'text-delta':
                if (activeStreamRef.current.partId !== chunk.partId) {
                    return
                }

                updateMessages(current => appendTextDelta(current, activeStreamRef.current.messageId ?? '', chunk.delta))
                return
            case 'text-end':
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
