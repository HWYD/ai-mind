import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedChatExecutionContext } from '@/lib/ai/runtime/types'
import type { ChatRequest } from '@/lib/ai/types/chat'

const runtimeMocks = vi.hoisted(() => ({
    run: vi.fn(),
}))

vi.mock('@/lib/ai/runtime/chat-orchestrator', () => ({
    ChatOrchestrator: class ChatOrchestratorMock {
        run = runtimeMocks.run
    },
}))

import { createChatService } from '@/lib/ai/chat-service'

describe('createChatService', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        runtimeMocks.run.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('长时间没有业务 chunk 时写入透明心跳，并在请求结束后清理定时器', async () => {
        let finishRun: (() => void) | undefined
        runtimeMocks.run.mockImplementation(
            () =>
                new Promise<void>(resolve => {
                    finishRun = resolve
                })
        )

        const response = await createChatService().streamChat({} as ChatRequest, {} as ResolvedChatExecutionContext)
        const reader = response.body?.getReader()

        expect(reader).toBeDefined()
        expect(response.headers.get('X-Accel-Buffering')).toBe('no')

        const heartbeatRead = reader?.read()
        await vi.advanceTimersByTimeAsync(15_000)

        await expect(heartbeatRead).resolves.toMatchObject({
            done: false,
            value: new TextEncoder().encode('\n'),
        })

        finishRun?.()
        await expect(reader?.read()).resolves.toMatchObject({ done: true })
        expect(vi.getTimerCount()).toBe(0)
    })
})
