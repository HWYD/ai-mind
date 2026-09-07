/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatMemoryUsage } from '@/components/instamind/use-chat-memory-usage'
import type { ChatModel } from '@/lib/ai/models'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('useChatMemoryUsage', () => {
    it('在 normal finish 返回 idle 后刷新当前模型的 chat memory usage', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ effectiveWindowTokens: 128000, usedPercent: 13 })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ effectiveWindowTokens: 128000, usedPercent: 14 })))
        vi.stubGlobal('fetch', fetchMock)

        const { result, rerender } = renderHook(
            ({ completionRevision }) =>
                useChatMemoryUsage({
                    conversationId: 'conv-context-usage',
                    draftMode: false,
                    model: 'qwen/qwen3.6-flash',
                    status: 'ready',
                    streamCompletionRevision: completionRevision,
                }),
            { initialProps: { completionRevision: 0 } }
        )

        await waitFor(() => {
            expect(result.current).toEqual({ effectiveWindowTokens: 128000, usedPercent: 13 })
        })

        rerender({ completionRevision: 1 })

        await waitFor(() => {
            expect(result.current).toEqual({ effectiveWindowTokens: 128000, usedPercent: 14 })
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(fetchMock).toHaveBeenLastCalledWith(
            '/api/chat/context-usage?conversationId=conv-context-usage&modelId=qwen%2Fqwen3.6-flash',
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        )
    })

    it('在草稿或 streaming 中隐藏 indicator 且不请求 usage', () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const draft = renderHook(() =>
            useChatMemoryUsage({
                conversationId: null,
                draftMode: true,
                model: 'qwen/qwen3.6-flash',
                status: 'ready',
                streamCompletionRevision: 0,
            })
        )
        const streaming = renderHook(() =>
            useChatMemoryUsage({
                conversationId: 'conv-context-usage',
                draftMode: false,
                model: 'qwen/qwen3.6-flash',
                status: 'streaming',
                streamCompletionRevision: 1,
            })
        )

        expect(draft.result.current).toBeNull()
        expect(streaming.result.current).toBeNull()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('用量读取失败时隐藏旧 snapshot，不产生聊天错误 UI', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ effectiveWindowTokens: 128000, usedPercent: 13 })))
            .mockResolvedValueOnce(new Response(null, { status: 503 }))
        vi.stubGlobal('fetch', fetchMock)

        const { result, rerender } = renderHook(
            ({ model }: { model: ChatModel }) =>
                useChatMemoryUsage({
                    conversationId: 'conv-context-usage',
                    draftMode: false,
                    model,
                    status: 'ready',
                    streamCompletionRevision: 0,
                }),
            { initialProps: { model: 'qwen/qwen3.6-flash' } }
        )

        await waitFor(() => {
            expect(result.current).toEqual({ effectiveWindowTokens: 128000, usedPercent: 13 })
        })

        rerender({ model: 'ollama/qwen3-8b' })

        await waitFor(() => {
            expect(result.current).toBeNull()
        })
    })

    it('拒绝带额外字段的 usage 响应，避免接受扩展后的公开契约', async () => {
        let resolveBody: (body: unknown) => void = () => undefined
        const fetchMock = vi.fn().mockResolvedValue({
            json: () =>
                new Promise(resolve => {
                    resolveBody = resolve
                }),
            ok: true,
        })
        vi.stubGlobal('fetch', fetchMock)

        const { result } = renderHook(() =>
            useChatMemoryUsage({
                conversationId: 'conv-context-usage',
                draftMode: false,
                model: 'qwen/qwen3.6-flash',
                status: 'ready',
                streamCompletionRevision: 0,
            })
        )

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledOnce()
        })

        await act(async () => {
            resolveBody({ effectiveWindowTokens: 128000, providerConfig: 'secret', usedPercent: 13 })
            await Promise.resolve()
        })

        expect(result.current).toBeNull()
    })
})
