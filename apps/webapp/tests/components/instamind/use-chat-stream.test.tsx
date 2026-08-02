/** @vitest-environment jsdom */

import type { ChatStreamChunk } from '@ai-mind/stream-core/protocol'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatStream as useChatStreamBase } from '@/components/instamind/use-chat-stream'
import type { ChatStreamEventEnvelope } from '@/lib/ai/stream-chunk-schema'

const TEST_CONVERSATION_ID = 'conv-current'

function createNdjsonResponse(
    chunks: Array<ChatStreamChunk | ChatStreamEventEnvelope>,
    status = 200,
    runId = 'run_test',
    startSequence = 1
) {
    const encoder = new TextEncoder()
    const responseRunId =
        chunks.find((chunk): chunk is ChatStreamEventEnvelope => 'protocolVersion' in chunk)?.runId ??
        chunks.find((chunk): chunk is Extract<ChatStreamChunk, { runId: string }> => 'runId' in chunk)?.runId ??
        runId

    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const [index, chunk] of chunks.entries()) {
                const line =
                    'protocolVersion' in chunk
                        ? chunk
                        : createStreamEnvelope(chunk as ChatStreamEventEnvelope['payload'], responseRunId, startSequence + index)
                controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
            }

            controller.close()
        },
    })

    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'X-Run-Id': responseRunId,
            'X-Stream-Protocol': 'ai-mind-resumable-v1',
        },
    })
}

function createStreamEnvelope(payload: ChatStreamEventEnvelope['payload'], runId: string, sequence: number): ChatStreamEventEnvelope {
    const terminalState =
        payload.type === 'finish'
            ? 'completed'
            : payload.type === 'error' && (payload.scope === 'request' || payload.scope === 'runtime')
              ? 'failed'
              : null
    const isTerminal = terminalState !== null
    const isLifecycle = payload.type === 'agent-interrupt' || payload.type === 'agent-resume'

    return {
        eventId: `${runId}-event-${sequence}`,
        eventKind: isTerminal ? 'terminal' : isLifecycle ? 'lifecycle' : 'chunk',
        payload,
        protocolVersion: 1,
        runId,
        sequence,
        ...(terminalState ? { runStatus: terminalState, terminal: true, terminalState } : {}),
    }
}

function getChatFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
    return fetchMock.mock.calls.filter(call => String(call[0]) === '/api/chat')
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
    ])
}

afterEach(() => {
    vi.useRealTimers()
    window.localStorage.clear()
    vi.restoreAllMocks()
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
        expect(requestInit?.headers).toMatchObject({
            'Content-Type': 'application/json',
            'Idempotency-Key': expect.any(String),
        })
    })

    it('duplicate POST replay descriptor 会改走 recovery GET，而不是把 JSON 当作 NDJSON 消费', async () => {
        const encoder = new TextEncoder()
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)

            if (url.startsWith('/api/chat/thread')) {
                return Promise.resolve(createThreadHydrationResponse(TEST_CONVERSATION_ID))
            }

            if (url === '/api/chat') {
                return Promise.resolve(
                    Response.json({
                        kind: 'stream-replay',
                        lastSequence: 4,
                        replayed: true,
                        runId: 'run_replay',
                        status: 'running',
                        streamUrl: '/api/chat/runs/run_replay/stream',
                    })
                )
            }

            if (url === '/api/chat/runs/run_replay/stream') {
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        for (const line of [
                            '{"protocolVersion":1,"eventId":"evt_1","runId":"run_replay","sequence":1,"eventKind":"chunk","payload":{"type":"start","messageId":"assistant-replay"}}',
                            '{"protocolVersion":1,"eventId":"evt_2","runId":"run_replay","sequence":2,"eventKind":"chunk","payload":{"type":"text-start","partId":"text-replay"}}',
                            '{"protocolVersion":1,"eventId":"evt_3","runId":"run_replay","sequence":3,"eventKind":"chunk","payload":{"type":"text-delta","partId":"text-replay","delta":"replayed"}}',
                            '{"protocolVersion":1,"eventId":"evt_4","runId":"run_replay","sequence":4,"eventKind":"terminal","payload":{"type":"finish"},"terminal":true,"terminalState":"completed"}',
                        ]) {
                            controller.enqueue(encoder.encode(`${line}\n`))
                        }

                        controller.close()
                    },
                })

                return Promise.resolve(
                    new Response(body, {
                        headers: {
                            'Content-Type': 'application/x-ndjson; profile="ai-mind-resumable-v1"',
                        },
                    })
                )
            }

            return Promise.reject(new Error(`Unexpected fetch: ${url}`))
        })

        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('继续已有 run')
        })

        const recoveryRequest = fetchMock.mock.calls.find(call => String(call[0]) === '/api/chat/runs/run_replay/stream')
        const recoveryInit = recoveryRequest?.[1] as RequestInit | undefined
        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(recoveryInit?.method).toBe('GET')
        expect(recoveryInit?.headers).toMatchObject({
            'Last-Event-ID': '0',
        })
        expect(textPart).toMatchObject({
            text: 'replayed',
            type: 'text',
        })
        expect(result.current.streamRecoveryStatus).toBe('terminal')
    })

    it('在 initial POST 挂起至剩余预算耗尽时中止该 attempt，而不追加新的 POST', async () => {
        vi.useFakeTimers()
        const fetchMock = withThreadHydration(
            (_input, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true })
                })
        )

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderChatStreamHook()
        let sendPromise: Promise<boolean>

        act(() => {
            sendPromise = result.current.sendMessage('等待初始请求超时')
        })

        await act(async () => {
            await vi.advanceTimersByTimeAsync(20_000)
            await sendPromise!
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
        expect(result.current.status).toBe('ready')
        expect(result.current.messages.at(-1)).toMatchObject({
            role: 'assistant',
            status: 'failed',
        })
    })

    it('在 non-terminal EOF 后使用当前 cursor 进行 GET recovery', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        const fetchMock = withThreadHydration((input: RequestInfo | URL) => {
            const url = String(input)

            if (url === '/api/chat') {
                return createNdjsonResponse(
                    [
                        { type: 'start', messageId: 'assistant-eof' },
                        { type: 'text-start', partId: 'text-eof' },
                        { type: 'text-delta', partId: 'text-eof', delta: '保留内容' },
                    ],
                    200,
                    'run-eof'
                )
            }

            if (url === '/api/chat/runs/run-eof/stream') {
                return createNdjsonResponse([{ type: 'finish' }], 200, 'run-eof', 4)
            }

            throw new Error(`Unexpected fetch: ${url}`)
        })

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('恢复 EOF')
        })

        const recoveryRequest = fetchMock.mock.calls.find(call => String(call[0]) === '/api/chat/runs/run-eof/stream')

        expect(recoveryRequest?.[1]).toMatchObject({
            headers: {
                'Last-Event-ID': '3',
            },
            method: 'GET',
        })
        expect(result.current.streamRecoveryStatus).toBe('terminal')
    })

    it('在 replay descriptor 的首次 GET 失败后继续 GET recovery 而不重发 POST', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        let recoveryAttempts = 0
        const fetchMock = withThreadHydration((input: RequestInfo | URL) => {
            const url = String(input)

            if (url === '/api/chat') {
                return Response.json({
                    kind: 'stream-replay',
                    lastSequence: 0,
                    replayed: true,
                    runId: 'run-replay-recovery',
                    status: 'running',
                    streamUrl: '/api/chat/runs/run-replay-recovery/stream',
                })
            }

            if (url === '/api/chat/runs/run-replay-recovery/stream') {
                recoveryAttempts += 1

                if (recoveryAttempts === 1) {
                    return Promise.reject(new TypeError('Failed to fetch'))
                }

                return createNdjsonResponse(
                    [{ type: 'start', messageId: 'assistant-replay-recovery' }, { type: 'finish' }],
                    200,
                    'run-replay-recovery'
                )
            }

            throw new Error(`Unexpected fetch: ${url}`)
        })

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('恢复 replay')
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
        expect(recoveryAttempts).toBe(2)
        expect(result.current.streamRecoveryStatus).toBe('terminal')
    })

    it('初始 POST 未拿到响应时会复用幂等键重试，并通过 replay GET 继续同一轮消息', async () => {
        let postAttempt = 0
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.startsWith('/api/chat/thread')) {
                return Promise.resolve(createThreadHydrationResponse(TEST_CONVERSATION_ID))
            }

            if (url === '/api/chat') {
                postAttempt += 1

                if (postAttempt === 1) {
                    return Promise.reject(new TypeError('Failed to fetch'))
                }

                return Promise.resolve(
                    Response.json({
                        kind: 'stream-replay',
                        lastSequence: 0,
                        replayed: true,
                        runId: 'run_initial_post_retry',
                        status: 'running',
                        streamUrl: '/api/chat/runs/run_initial_post_retry/stream',
                    })
                )
            }

            if (url === '/api/chat/runs/run_initial_post_retry/stream') {
                return Promise.resolve(
                    createNdjsonResponse(
                        [
                            { type: 'start', messageId: 'assistant-initial-post-retry' },
                            { type: 'text-start', partId: 'text-initial-post-retry' },
                            { type: 'text-delta', partId: 'text-initial-post-retry', delta: '已从同一 run 恢复。' },
                            { type: 'finish' },
                        ],
                        200,
                        'run_initial_post_retry'
                    )
                )
            }

            return Promise.reject(new Error(`Unexpected fetch: ${url}`))
        })

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('继续这次提交')
        })

        const postCalls = getChatFetchCalls(fetchMock)
        const firstInit = postCalls[0]?.[1] as RequestInit | undefined
        const secondInit = postCalls[1]?.[1] as RequestInit | undefined
        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(postCalls).toHaveLength(2)
        expect(firstInit?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) })
        expect(secondInit?.headers).toMatchObject({ 'Idempotency-Key': (firstInit?.headers as Record<string, string>)['Idempotency-Key'] })
        expect(secondInit?.body).toBe(firstInit?.body)
        expect(result.current.messages.filter(message => message.role === 'user')).toHaveLength(1)
        expect(textPart).toMatchObject({ text: '已从同一 run 恢复。', type: 'text' })
        expect(fetchMock.mock.calls.filter(call => String(call[0]) === '/api/chat/runs/run_initial_post_retry/stream')).toHaveLength(1)
    })

    it('JSON 声明但没有响应体时也会复用幂等键重试初始 POST', async () => {
        let postAttempt = 0
        const fetchMock = vi.fn().mockImplementation(() => {
            postAttempt += 1

            if (postAttempt === 1) {
                return Promise.resolve(new Response(null, { headers: { 'Content-Type': 'application/json' } }))
            }

            return Promise.resolve(
                createNdjsonResponse(
                    [
                        { type: 'start', messageId: 'assistant-empty-json-body' },
                        { type: 'text-start', partId: 'text-empty-json-body' },
                        { type: 'text-delta', partId: 'text-empty-json-body', delta: '重试成功。' },
                        { type: 'finish' },
                    ],
                    200,
                    'run_empty_json_body'
                )
            )
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('处理空响应体')
        })

        const postCalls = getChatFetchCalls(fetchMock)
        const firstHeaders = postCalls[0]?.[1]?.headers as Record<string, string> | undefined
        const secondHeaders = postCalls[1]?.[1]?.headers as Record<string, string> | undefined
        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')

        expect(postCalls).toHaveLength(2)
        expect(secondHeaders?.['Idempotency-Key']).toBe(firstHeaders?.['Idempotency-Key'])
        expect(assistantMessage?.parts).toContainEqual(expect.objectContaining({ text: '重试成功。', type: 'text' }))
    })

    it('初始 POST 的永久失败不会自动重试', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: '请求参数无效。' }, { status: 400 }))

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('不应重试')
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
        expect(result.current.messages.find(message => message.role === 'assistant')?.status).toBe('failed')
    })

    it('初始 POST 重试预算耗尽时保留未确认结果，不会再补发请求', async () => {
        let now = 0
        vi.spyOn(Date, 'now').mockImplementation(() => now)
        const fetchMock = vi.fn().mockImplementation(() => {
            now = 20_000
            return Promise.reject(new TypeError('Failed to fetch'))
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderChatStreamHook()

        await act(async () => {
            await result.current.sendMessage('网络状态未知')
        })

        const assistantMessage = result.current.messages.find(message => message.role === 'assistant')
        const textPart = assistantMessage?.parts.find(part => part.type === 'text')

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
        expect(textPart).toMatchObject({ text: '初始请求状态未确认，请稍后重试。', type: 'text' })
    })

    it('取消初始 POST 的退避等待后不会继续补发请求', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderChatStreamHook()
        let sendPromise!: Promise<boolean>

        await act(async () => {
            sendPromise = result.current.sendMessage('取消等待')
        })
        await waitFor(() => {
            expect(result.current.streamRecoveryStatus).toBe('reconnecting')
        })

        await act(async () => {
            result.current.cancel()
            await sendPromise
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
        expect(result.current.status).toBe('ready')
    })

    it('卸载页面会中止初始 POST 的退避等待，不会在后台补发请求', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result, unmount } = renderChatStreamHook()
        let sendPromise!: Promise<boolean>

        await act(async () => {
            sendPromise = result.current.sendMessage('关闭页面')
        })
        await waitFor(() => {
            expect(result.current.streamRecoveryStatus).toBe('reconnecting')
        })

        await act(async () => {
            unmount()
            await sendPromise
        })

        expect(getChatFetchCalls(fetchMock)).toHaveLength(1)
    })

    it('长时间运行后断线仍会先尝试 recovery GET', async () => {
        const encoder = new TextEncoder()
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
        let now = 0
        vi.spyOn(Date, 'now').mockImplementation(() => now)
        vi.spyOn(Math, 'random').mockReturnValue(0.5)

        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.startsWith('/api/chat/thread')) {
                return Promise.resolve(createThreadHydrationResponse(TEST_CONVERSATION_ID))
            }

            if (url === '/api/chat') {
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        streamController = controller
                        controller.enqueue(
                            encoder.encode(
                                `${JSON.stringify(
                                    createStreamEnvelope({ messageId: 'assistant-long-running', type: 'start' }, 'run-long-running', 1)
                                )}\n`
                            )
                        )
                    },
                })

                return Promise.resolve(
                    new Response(body, {
                        headers: {
                            'Content-Type': 'application/x-ndjson; profile="ai-mind-resumable-v1"',
                            'X-Run-Id': 'run-long-running',
                        },
                    })
                )
            }

            if (url === '/api/chat/runs/run-long-running/stream') {
                return Promise.resolve(createNdjsonResponse([createStreamEnvelope({ type: 'finish' }, 'run-long-running', 2)]))
            }

            return Promise.reject(new Error(`Unexpected fetch: ${url}`))
        })

        vi.stubGlobal('fetch', fetchMock)
        const { result } = renderChatStreamHook()

        let sendPromise!: Promise<boolean>
        await act(async () => {
            sendPromise = result.current.sendMessage('生成交付计划')
            await Promise.resolve()
        })

        await waitFor(() => {
            expect(streamController).not.toBeNull()
            expect(result.current.status).toBe('streaming')
        })

        now = 180_001
        await act(async () => {
            streamController?.error(new Error('transport disconnected'))
        })

        await waitFor(
            () => {
                expect(fetchMock.mock.calls.some(call => String(call[0]) === '/api/chat/runs/run-long-running/stream')).toBe(true)
            },
            { timeout: 1_500 }
        )
        await sendPromise

        await waitFor(
            () => {
                expect(result.current.streamRecoveryStatus).toBe('terminal')
                expect(result.current.error).toBeNull()
            },
            { timeout: 2_000 }
        )
    })

    it('captures the active conversation at request start even if the hook props change mid-stream', async () => {
        const encoder = new TextEncoder()
        const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
            const signal = init?.signal

            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify(createStreamEnvelope({ type: 'start', messageId: 'assistant-ownership' }, 'run_ownership', 1))}\n`
                        )
                    )
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify(createStreamEnvelope({ type: 'text-start', partId: 'text-ownership' }, 'run_ownership', 2))}\n`
                        )
                    )
                    controller.enqueue(
                        encoder.encode(
                            `${JSON.stringify(createStreamEnvelope({ type: 'text-delta', partId: 'text-ownership', delta: '正在输出' }, 'run_ownership', 3))}\n`
                        )
                    )

                    const finishTimer = window.setTimeout(() => {
                        controller.enqueue(
                            encoder.encode(`${JSON.stringify(createStreamEnvelope({ type: 'finish' }, 'run_ownership', 4))}\n`)
                        )
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
                        'X-Run-Id': 'run_ownership',
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

                    controller.enqueue(encoder.encode(`${JSON.stringify(createStreamEnvelope(startChunk, 'run_abort', 1))}\n`))
                    controller.enqueue(encoder.encode(`${JSON.stringify(createStreamEnvelope(textStartChunk, 'run_abort', 2))}\n`))
                    controller.enqueue(encoder.encode(`${JSON.stringify(createStreamEnvelope(textDeltaChunk, 'run_abort', 3))}\n`))

                    const finishTimer = window.setTimeout(() => {
                        controller.enqueue(encoder.encode(`${JSON.stringify(createStreamEnvelope(finishChunk, 'run_abort', 4))}\n`))
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
                        'X-Run-Id': 'run_abort',
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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

        vi.stubGlobal('fetch', withThreadHydration(createNdjsonResponse(streamChunks)))
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
                    createNdjsonResponse(
                        [
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
                        ],
                        200,
                        'run-resume',
                        3
                    )
                )
            }

            return Promise.resolve(
                createNdjsonResponse(
                    [
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
                    ],
                    200,
                    'run-resume'
                )
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
        expect((resumeRequest?.[1] as RequestInit | undefined)?.headers).toMatchObject({
            'Content-Type': 'application/json',
        })
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

    it('resumeAgentRun 复用已消费的 stream cursor，不会误触发 recovery GET', async () => {
        const runId = 'run-resume-cursor'
        const threadId = `tasklist-agent:c1:${runId}`
        const initialResponse = [
            createStreamEnvelope({ messageId: 'assistant-resume-cursor', type: 'start' }, runId, 1),
            createStreamEnvelope(
                {
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-resume-cursor',
                    interruptId: 'interrupt-cursor',
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
                        threadId,
                    },
                    runId,
                    threadId,
                    type: 'agent-interrupt',
                },
                runId,
                2
            ),
        ]
        const resumeResponse = [
            createStreamEnvelope(
                {
                    agentName: 'version-plan-to-tasklist-agent',
                    assistantMessageId: 'assistant-resume-cursor',
                    interruptId: 'interrupt-cursor',
                    runId,
                    threadId,
                    type: 'agent-resume',
                },
                runId,
                3
            ),
            createStreamEnvelope({ type: 'finish' }, runId, 4),
        ]
        const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
            const url = String(input)

            if (url.includes('/resume')) {
                return Promise.resolve(createNdjsonResponse(resumeResponse))
            }

            if (url.includes('/api/chat/runs/')) {
                return Promise.reject(new Error('unexpected recovery GET'))
            }

            return Promise.resolve(createNdjsonResponse(initialResponse))
        })

        vi.stubGlobal('fetch', withThreadHydration(fetchMock))
        const { result } = renderHook(() => useChatStream({ enableReasoning: false }))

        await act(async () => {
            await result.current.sendMessage('生成 tasklist')
        })
        await waitFor(() => {
            expect(result.current.pendingInterrupt?.part.runId).toBe(runId)
        })

        await act(async () => {
            await result.current.resumeAgentRun({ type: 'approve' })
        })
        await waitFor(() => {
            expect(result.current.status).toBe('ready')
        })

        expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/chat/runs/'))).toBe(false)
        expect(result.current.pendingInterrupt).toBeNull()
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
                    createNdjsonResponse(
                        [
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
                        ],
                        200,
                        'run-reject',
                        4
                    )
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
