/** @vitest-environment jsdom */

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream as useChatStreamBase } from '@/components/instamind/use-chat-stream'

const TEST_CONVERSATION_ID = 'conv-current'

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

function getChatFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(call => !String(call[0]).startsWith('/api/chat/thread'))
}

function createThreadHydrationResponse(conversationId = TEST_CONVERSATION_ID) {
    return Response.json({
        conversationId,
        threadId: `chat-conversation:${'a'.repeat(64)}:${'b'.repeat(64)}`,
        messages: [],
        pinnedDecisions: [],
        restored: false,
    })
}

function withThreadHydration(
    chatResponse: Response | Promise<Response> | ((input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>)
) {
    return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('/api/chat/thread')) {
            const url = new URL(String(input), 'http://localhost')
            return Promise.resolve(createThreadHydrationResponse(url.searchParams.get('conversationId') ?? TEST_CONVERSATION_ID))
        }

        if (typeof chatResponse === 'function') {
            return Promise.resolve(chatResponse(input, init))
        }

        return Promise.resolve(chatResponse)
    })
}

function useChatStream(options: Parameters<typeof useChatStreamBase>[0] = {}) {
    return useChatStreamBase({
        conversationId: TEST_CONVERSATION_ID,
        enableReasoning: false,
        ...options,
    })
}

function renderChatStreamHook(options: Parameters<typeof useChatStreamBase>[0] = {}) {
    return renderHook(() =>
        useChatStream({
            ...options,
        })
    )
}

function createStrategyInterruptResponse(runId = 'run-resume-error', interruptId = 'interrupt-strategy-error') {
    return createNdjsonResponse([
        { type: 'start', messageId: 'assistant-resume-error' },
        {
            agentName: 'version-plan-to-tasklist-agent',
            assistantMessageId: 'assistant-resume-error',
            interruptId,
            interruptKind: 'strategy_review',
            payload: {
                allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                data: {
                    planUri: 'demo://version-plans/v0.3.0.md',
                    reviewRound: 1,
                    strategy: {
                        granularity: 'medium',
                        grouping: 'by_phase',
                        priorityFocus: ['core_runtime'],
                        stepCountRange: '5-8',
                    },
                },
                kind: 'strategy_review',
                nodeName: 'reviewTasklistStrategy',
                runId,
                threadId: `tasklist-agent:c1:${runId}`,
            },
            runId,
            threadId: `tasklist-agent:c1:${runId}`,
            type: 'agent-interrupt',
        },
        { type: 'finish' },
    ])
}

afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    cleanup()
})

describe('useChatStream', () => {
    it('模型提供方限流时会在当前轮次追加 assistant 错误消息，不进入顶部错误态', async () => {
        vi.stubGlobal(
            'fetch',
            withThreadHydration(
                Response.json(
                    {
                        error: '聊天请求已达到当前 IP 的当日上限（2 次）。',
                        code: 'MODEL_PROVIDER_RATE_LIMITED',
                        limitKey: 'ip',
                    },
                    { status: 429 }
                )
            )
        )

        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('你好')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        expect(result.current.error).toBeNull()
        expect(result.current.messages).toHaveLength(2)
        expect(result.current.messages[0]?.role).toBe('user')
        expect(result.current.messages[1]?.role).toBe('assistant')

        const textPart = result.current.messages[1]?.parts.find(part => part.type === 'text')

        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toBe('聊天请求已达到当前 IP 的当日上限（2 次）。')
    })

    it('会把当前选中的 modelId 和 enableReasoning 放进聊天请求 options 中', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(createNdjsonResponse([{ type: 'start', messageId: 'assistant-model' }, { type: 'finish' }]))

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ model: 'qwen/qwen3.6-plus', enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('你好')
        })

        const requestInit = getChatFetchCalls(fetchMock)[0]?.[1] as RequestInit | undefined
        const requestBody = typeof requestInit?.body === 'string' ? JSON.parse(requestInit.body) : null

        expect(requestBody?.options?.modelId).toBe('qwen/qwen3.6-plus')
        expect(requestBody?.options?.enableReasoning).toBe(false)
    })

    it('captures the active conversation at request start even if the hook props change mid-stream', async () => {
        const encoder = new TextEncoder()
        const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
            const signal = init?.signal

            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'start', messageId: 'assistant-ownership' })}\n`))
                    controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'text-start', partId: 'text-ownership' })}\n`))
                    controller.enqueue(
                        encoder.encode(`${JSON.stringify({ type: 'text-delta', partId: 'text-ownership', delta: '正在输出' })}\n`)
                    )

                    const finishTimer = window.setTimeout(() => {
                        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'finish' })}\n`))
                        controller.close()
                    }, 30)

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

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result, rerender } = renderHook(
            ({ conversationId }) =>
                useChatStreamBase({
                    conversationId,
                    enableReasoning: false,
                }),
            {
                initialProps: {
                    conversationId: 'conv-a',
                },
            }
        )

        let sendPromise!: Promise<boolean>

        await act(async () => {
            sendPromise = result.current.sendMessage('开始流式输出')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('streaming')
        })

        rerender({
            conversationId: 'conv-b',
        })

        await act(async () => {
            await sendPromise
        })

        const chatRequest = fetchMock.mock.calls.find(call => String(call[0]) === '/api/chat')
        const requestBody = JSON.parse(String((chatRequest?.[1] as RequestInit | undefined)?.body))

        expect(requestBody.conversationId).toBe('conv-a')
    })

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
                    }, 1000)

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

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
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

        const chatFetchCalls = getChatFetchCalls(fetchMock)

        expect(chatFetchCalls).toHaveLength(1)
        expect(chatFetchCalls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
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
                uri: 'demo://NOT_EXIST.md',
                serverId: 'project-docs-server',
            },
            {
                type: 'error',
                scope: 'resource',
                errorCode: 'TOOL_EXECUTION_FAILED',
                retryable: false,
                message: '未找到文件',
                partId: 'resource-1',
                resourceName: 'NOT_EXIST.md',
                uri: 'demo://NOT_EXIST.md',
                serverId: 'project-docs-server',
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
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.id === 'assistant-3')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(result.current.error).toBeNull()
        expect(assistantMessage?.status).toBe('failed')
        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toContain('Model streaming failed.')
    })

    it('artifact chunks 会聚合到 message.artifacts 且不混入普通 text part', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-artifact' },
            {
                type: 'artifact-start',
                artifactId: 'artifact-tasklist',
                artifactKind: 'tasklist',
                artifactType: 'text',
                format: 'markdown',
                title: 'v0.1.1 Tasklist 草稿',
            },
            {
                type: 'artifact-delta',
                artifactId: 'artifact-tasklist',
                delta: '# v0.1.1 Tasklist\n\n',
            },
            {
                type: 'artifact-delta',
                artifactId: 'artifact-tasklist',
                delta: '## Step 1\n- [ ] 实现 artifact',
            },
            {
                type: 'artifact-end',
                artifactId: 'artifact-tasklist',
                metadata: {
                    charCount: 42,
                    sectionCount: 2,
                    validated: true,
                },
                status: 'completed',
            },
            { type: 'text-start', partId: 'text-summary' },
            {
                type: 'text-delta',
                partId: 'text-summary',
                delta: '结构校验结论：pass',
            },
            { type: 'text-end', partId: 'text-summary' },
            { type: 'finish' },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(assistantMessage?.artifacts).toHaveLength(1)
        expect(assistantMessage?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-tasklist',
            artifactKind: 'tasklist',
            content: '# v0.1.1 Tasklist\n\n## Step 1\n- [ ] 实现 artifact',
            status: 'completed',
            title: 'v0.1.1 Tasklist 草稿',
        })
        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toBe('结构校验结论：pass')
        expect(textPart?.text).not.toContain('## Step 1')
    })

    it('failed artifact 会保留在消息中且不导致页面状态失败', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-artifact-failed' },
            {
                type: 'artifact-start',
                artifactId: 'artifact-failed',
                artifactKind: 'generic_markdown',
                artifactType: 'text',
                format: 'markdown',
                title: 'Markdown 产物',
            },
            {
                type: 'artifact-end',
                artifactId: 'artifact-failed',
                error: 'artifact writer failed',
                status: 'failed',
            },
            { type: 'finish' },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成报告')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')

        expect(assistantMessage?.parts).toHaveLength(0)
        expect(assistantMessage?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-failed',
            error: 'artifact writer failed',
            status: 'failed',
        })
    })

    it('agent-interrupt 后保留 paused assistant message 并暴露 pendingInterrupt', async () => {
        const streamChunks: ChatStreamChunk[] = [
            { type: 'start', messageId: 'assistant-hitl' },
            {
                agentName: 'version-plan-to-tasklist-agent',
                assistantMessageId: 'assistant-hitl',
                interruptId: 'interrupt-strategy',
                interruptKind: 'strategy_review',
                payload: {
                    allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                    data: {
                        planUri: 'demo://version-plans/v0.3.0.md',
                        reviewRound: 1,
                        strategy: {
                            granularity: 'medium',
                            grouping: 'by_phase',
                            priorityFocus: ['core_runtime'],
                            stepCountRange: '5-8',
                        },
                    },
                    kind: 'strategy_review',
                    nodeName: 'reviewTasklistStrategy',
                    runId: 'run-hitl',
                    threadId: 'tasklist-agent:c1:run-hitl',
                },
                runId: 'run-hitl',
                threadId: 'tasklist-agent:c1:run-hitl',
                type: 'agent-interrupt',
            },
            { type: 'finish' },
        ]

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createNdjsonResponse(streamChunks)))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.id === 'assistant-hitl')

        expect(assistantMessage?.status).toBe('paused')
        expect(result.current.pendingInterrupt?.part).toMatchObject({
            interruptId: 'interrupt-strategy',
            runId: 'run-hitl',
            status: 'pending',
        })
        expect(window.localStorage.getItem('ai-mind:pending-agent-run-id')).toBeNull()
    })

    it('pending interrupt 时锁定普通 send、regenerate 和 delete turn', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            createNdjsonResponse([
                { type: 'start', messageId: 'assistant-hitl' },
                {
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-hitl',
                    interruptId: 'interrupt-strategy',
                    interruptKind: 'strategy_review',
                    payload: {
                        allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                        data: {
                            planUri: 'demo://version-plans/v0.3.0.md',
                            reviewRound: 1,
                            strategy: {
                                granularity: 'medium',
                                grouping: 'by_phase',
                                priorityFocus: ['core_runtime'],
                                stepCountRange: '5-8',
                            },
                        },
                        kind: 'strategy_review',
                        nodeName: 'reviewTasklistStrategy',
                        runId: 'run-lock',
                        threadId: 'tasklist-agent:c1:run-lock',
                    },
                    runId: 'run-lock',
                    threadId: 'tasklist-agent:c1:run-lock',
                    type: 'agent-interrupt',
                },
                { type: 'finish' },
            ])
        )

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })
        await waitFor(() => {
            expect(result.current.pendingInterrupt?.part.runId).toBe('run-lock')
        })

        const userMessageId = result.current.messages.find(message => message.role === 'user')?.id

        await act(async () => {
            expect(await result.current.sendMessage('普通追问')).toBe(false)
            expect(await result.current.regenerateLastTurn()).toBe(false)
            expect(result.current.deleteUserTurn(userMessageId ?? 'missing-user-message')).toBe(false)
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
    })

    it('页面初始化不会恢复 pending HITL，并会清理旧的 pendingAgentRunId', async () => {
        window.localStorage.setItem('ai-mind:pending-agent-run-id', 'run-restore')
        const fetchMock = vi.fn()

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await waitFor(() => {
            expect(window.localStorage.getItem('ai-mind:pending-agent-run-id')).toBeNull()
        })

        expect(fetchMock).toHaveBeenCalledWith(`/api/chat/thread?conversationId=${TEST_CONVERSATION_ID}`)
        expect(result.current.pendingInterrupt).toBeNull()
        expect(result.current.messages).toHaveLength(0)
    })

    it('resumeAgentRun 通过 resume API 继续写入原 assistant message', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.includes('/resume')) {
                return Promise.resolve(
                    createNdjsonResponse([
                        {
                            agentName: 'version-plan-to-tasklist-agent',
                            assistantMessageId: 'assistant-resume',
                            interruptId: 'interrupt-strategy',
                            runId: 'run-resume',
                            threadId: 'tasklist-agent:c1:run-resume',
                            type: 'agent-resume',
                        },
                        {
                            type: 'artifact-start',
                            artifactId: 'artifact-resume',
                            artifactKind: 'tasklist',
                            artifactType: 'text',
                            format: 'markdown',
                            title: 'Tasklist',
                        },
                        {
                            type: 'artifact-delta',
                            artifactId: 'artifact-resume',
                            delta: '# Resumed\n',
                        },
                        { type: 'finish' },
                    ])
                )
            }

            return Promise.resolve(
                createNdjsonResponse([
                    { type: 'start', messageId: 'assistant-resume' },
                    {
                        agentName: 'version-plan-to-tasklist-agent',
                        assistantMessageId: 'assistant-resume',
                        interruptId: 'interrupt-strategy',
                        interruptKind: 'strategy_review',
                        payload: {
                            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                            data: {
                                planUri: 'demo://version-plans/v0.3.0.md',
                                reviewRound: 1,
                                strategy: {
                                    granularity: 'medium',
                                    grouping: 'by_phase',
                                    priorityFocus: ['core_runtime'],
                                    stepCountRange: '5-8',
                                },
                            },
                            kind: 'strategy_review',
                            nodeName: 'reviewTasklistStrategy',
                            runId: 'run-resume',
                            threadId: 'tasklist-agent:c1:run-resume',
                        },
                        runId: 'run-resume',
                        threadId: 'tasklist-agent:c1:run-resume',
                        type: 'agent-interrupt',
                    },
                    { type: 'finish' },
                ])
            )
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })
        await waitFor(() => {
            expect(result.current.pendingInterrupt?.part.runId).toBe('run-resume')
        })

        await act(async () => {
            await result.current.resumeAgentRun({ type: 'approve' })
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const resumeRequest = fetchMock.mock.calls.find(call => String(call[0]).includes('/resume'))
        const assistantMessages = result.current.messages.filter(message => message.role === 'assistant')
        const assistantMessage = assistantMessages[0]

        expect(resumeRequest?.[0]).toBe('/api/agent-runs/run-resume/resume')
        expect(JSON.parse(String((resumeRequest?.[1] as RequestInit | undefined)?.body))).toEqual({
            decision: { type: 'approve' },
            interruptId: 'interrupt-strategy',
        })
        expect(assistantMessages).toHaveLength(1)
        expect(assistantMessage?.id).toBe('assistant-resume')
        expect(assistantMessage?.status).toBe('completed')
        expect(assistantMessage?.artifacts?.[0]).toMatchObject({
            artifactId: 'artifact-resume',
            content: '# Resumed\n',
        })
        expect(result.current.pendingInterrupt).toBeNull()
        expect(window.localStorage.getItem('ai-mind:pending-agent-run-id')).toBeNull()
    })

    it.each([
        [403, 'AGENT_RUN_FORBIDDEN', '当前审核点不属于当前浏览器会话，可能是页面会话或本地密钥已变化。请重新发起 /tasklist。'],
        [409, 'AGENT_INTERRUPT_NOT_PENDING', '当前审核点已被处理或已失效。请重新发起 /tasklist。'],
    ] as const)('resumeAgentRun 收到 %i %s 时在主界面显示明确错误并保留 pending interrupt', async (status, code, expectedMessage) => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.includes('/resume')) {
                return Promise.resolve(
                    Response.json(
                        {
                            code,
                            error: 'resume rejected',
                        },
                        { status }
                    )
                )
            }

            return Promise.resolve(createStrategyInterruptResponse())
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })
        await waitFor(() => {
            expect(result.current.pendingInterrupt?.part.runId).toBe('run-resume-error')
        })

        await act(async () => {
            await expect(result.current.resumeAgentRun({ type: 'approve' })).rejects.toThrow(`${expectedMessage}（${code}）`)
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.id === 'assistant-resume-error')
        const interruptPart = assistantMessage?.parts.find(part => part.type === 'agent-interrupt')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(result.current.error).toBe(expectedMessage)
        expect(result.current.pendingInterrupt?.part.interruptId).toBe('interrupt-strategy-error')
        expect(assistantMessage?.status).toBe('paused')
        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toBe(expectedMessage)
        expect(interruptPart).toMatchObject({
            interruptId: 'interrupt-strategy-error',
            status: 'pending',
        })
    })

    it('reject resume 会结束当前 AgentRun，并解除 pending interrupt', async () => {
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.includes('/resume')) {
                return Promise.resolve(
                    createNdjsonResponse([
                        {
                            agentName: 'version-plan-to-tasklist-agent',
                            assistantMessageId: 'assistant-reject',
                            interruptId: 'interrupt-strategy',
                            runId: 'run-reject',
                            threadId: 'tasklist-agent:c1:run-reject',
                            type: 'agent-resume',
                        },
                        {
                            partId: 'part-reject-summary',
                            type: 'text-start',
                        },
                        {
                            delta: '已终止本轮 tasklist 生成。当前策略不会继续执行。',
                            partId: 'part-reject-summary',
                            type: 'text-delta',
                        },
                        { partId: 'part-reject-summary', type: 'text-end' },
                        { type: 'finish' },
                    ])
                )
            }

            return Promise.resolve(
                createNdjsonResponse([
                    { type: 'start', messageId: 'assistant-reject' },
                    {
                        agentName: 'version-plan-to-tasklist-agent',
                        assistantMessageId: 'assistant-reject',
                        interruptId: 'interrupt-strategy',
                        interruptKind: 'strategy_review',
                        payload: {
                            allowedDecisions: ['approve', 'edit', 'reject', 'respond'],
                            data: {
                                planUri: 'demo://version-plans/v0.3.0.md',
                                reviewRound: 1,
                                strategy: {
                                    granularity: 'medium',
                                    grouping: 'by_phase',
                                    priorityFocus: ['core_runtime'],
                                    stepCountRange: '5-8',
                                },
                            },
                            kind: 'strategy_review',
                            nodeName: 'reviewTasklistStrategy',
                            runId: 'run-reject',
                            threadId: 'tasklist-agent:c1:run-reject',
                        },
                        runId: 'run-reject',
                        threadId: 'tasklist-agent:c1:run-reject',
                        type: 'agent-interrupt',
                    },
                    { type: 'finish' },
                ])
            )
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })
        await waitFor(() => {
            expect(result.current.pendingInterrupt?.part.runId).toBe('run-reject')
        })

        await act(async () => {
            await result.current.resumeAgentRun({ type: 'reject' })
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.id === 'assistant-reject')

        expect(assistantMessage?.status).toBe('completed')
        expect(assistantMessage?.parts.some(part => part.type === 'text' && part.text.includes('已终止本轮 tasklist 生成。'))).toBe(true)
        expect(result.current.pendingInterrupt).toBeNull()
        expect(window.localStorage.getItem('ai-mind:pending-agent-run-id')).toBeNull()
    })

    it('chat request 失败时会在当前轮次追加 assistant 失败回复', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                Response.json(
                    {
                        error: 'API Key 无效或已过期，请检查配置后重试。',
                    },
                    { status: 401 }
                )
            )
        )

        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成交付计划')
        })

        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(result.current.error).toBeNull()
        expect(assistantMessage?.status).toBe('failed')
        expect(textPart?.type).toBe('text')
        expect(textPart?.text).toBe('API Key 无效或已过期，请检查配置后重试。')
    })
})
