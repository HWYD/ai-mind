/** @vitest-environment jsdom */

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream } from '@/components/instamind/use-chat-stream'

function createNdjsonResponse(chunks: ChatStreamChunk[], status = 200) {
    const encoder = new TextEncoder()

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`))
            }

            controller.close()
        },
    })

    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
        },
    })
}

afterEach(() => {
    cleanup()
})

describe('useChatStream', () => {
    it('用户中止流式请求后会保留已收到的 assistant 内容', async () => {
        const encoder = new TextEncoder()
        const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
            const signal = init?.signal

            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    const startChunk: ChatStreamChunk = { type: 'start', messageId: 'assistant-abort' }
                    const textStartChunk: ChatStreamChunk = { type: 'text-start', partId: 'text-abort' }
                    const textDeltaChunk: ChatStreamChunk = {
                        type: 'text-delta',
                        partId: 'text-abort',
                        delta: 'Vue 的 diff 核心是同层比较。',
                    }
                    const finishChunk: ChatStreamChunk = { type: 'finish' }

                    controller.enqueue(encoder.encode(`${JSON.stringify(startChunk)}\n`))
                    controller.enqueue(encoder.encode(`${JSON.stringify(textStartChunk)}\n`))
                    controller.enqueue(encoder.encode(`${JSON.stringify(textDeltaChunk)}\n`))

                    const finishTimer = window.setTimeout(() => {
                        controller.enqueue(encoder.encode(`${JSON.stringify(finishChunk)}\n`))
                        controller.close()
                    }, 100)

                    signal?.addEventListener(
                        'abort',
                        () => {
                            window.clearTimeout(finishTimer)
                            controller.error(new DOMException('Request aborted', 'AbortError'))
                        },
                        { once: true }
                    )
                },
            })

            return Promise.resolve(
                new Response(body, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/x-ndjson; charset=utf-8',
                    },
                })
            )
        })

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        let sendPromise!: Promise<boolean>

        await act(async () => {
            sendPromise = result.current.sendMessage('Vue 的 diff 算法')
        })

        await waitFor(() => {
            const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
            const textPart = assistantMessage?.parts.find(part => part.type === 'text')

            expect(result.current.status).toBe('streaming')
            expect(textPart?.type).toBe('text')
            expect(textPart?.text).toContain('Vue 的 diff 核心是同层比较。')
        })

        await act(async () => {
            result.current.cancel()
            await sendPromise
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
        expect(result.current.error).toBeNull()
        expect(assistantMessage).toBeDefined()
        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toContain('Vue 的 diff 核心是同层比较。')
    })

    it('统一 error(scope=tool) 会更新 ToolPart.failed', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-1' },
            {
                type: 'tool-start',
                partId: 'tool-1',
                toolName: 'unit-convert',
                source: 'internal',
                input: 'value=1, from=kg, to=m',
            },
            {
                type: 'error',
                scope: 'tool',
                errorCode: 'TOOL_EXECUTION_FAILED',
                retryable: false,
                message: '单位类型不兼容',
                partId: 'tool-1',
                toolName: 'unit-convert',
                source: 'internal',
                input: 'value=1, from=kg, to=m',
            },
            { type: 'finish' },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ skillMode: 'utility', enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('把 1kg 换算成 m')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const toolPart = assistantMessage?.parts.find(part => part.type === 'tool')

        expect(toolPart?.type).toBe('tool')
        expect(toolPart?.status).toBe('failed')
        expect(toolPart?.error).toContain('单位类型不兼容')
    })

    it('统一 error(scope=resource) 会更新 ResourcePart.failed', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-2' },
            {
                type: 'resource-start',
                partId: 'resource-1',
                resourceName: 'NOT_EXIST.md',
                uri: 'project://NOT_EXIST.md',
                serverId: 'project-files-server',
            },
            {
                type: 'error',
                scope: 'resource',
                errorCode: 'TOOL_EXECUTION_FAILED',
                retryable: false,
                message: '未找到文件',
                partId: 'resource-1',
                resourceName: 'NOT_EXIST.md',
                uri: 'project://NOT_EXIST.md',
                serverId: 'project-files-server',
            },
            { type: 'finish' },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ skillMode: 'reader', enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('读取 NOT_EXIST.md')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const resourcePart = assistantMessage?.parts.find(part => part.type === 'resource')

        expect(resourcePart?.type).toBe('resource')
        expect(resourcePart?.status).toBe('failed')
        expect(resourcePart?.error).toContain('未找到文件')
    })

    it('统一 error(scope=runtime) 会进入顶层错误收口', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-3' },
            {
                type: 'error',
                scope: 'runtime',
                errorCode: 'MODEL_STREAM_FAILED',
                retryable: true,
                message: 'Model streaming failed.',
                stage: 'runtime',
            },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('你好')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('error')
        })

        expect(result.current.error).toContain('Model streaming failed.')
    })
})
