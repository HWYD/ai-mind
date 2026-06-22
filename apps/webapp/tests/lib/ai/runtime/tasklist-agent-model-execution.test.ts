import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    runTasklistAgentModelStep,
    TasklistAgentStepTimeoutError,
} from '@/lib/ai/runtime/version-plan-tasklist-agent/model/tasklist-agent-model-execution'

describe('tasklist agent model execution', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('阶段超过总时限时中止底层请求并抛出可归一化的超时错误', async () => {
        let operationSignal: AbortSignal | undefined
        const result = runTasklistAgentModelStep({
            operation: signal => {
                operationSignal = signal
                return new Promise<never>(() => undefined)
            },
            stage: 'planning-decision',
            timeoutMs: 90_000,
        })
        const rejection = expect(result).rejects.toMatchObject({
            code: 'MODEL_PROVIDER_TIMEOUT',
            name: 'TasklistAgentStepTimeoutError',
            stage: 'planning-decision',
            timeoutMs: 90_000,
        })

        await vi.advanceTimersByTimeAsync(90_000)

        await rejection
        expect(operationSignal?.aborted).toBe(true)
        expect(operationSignal?.reason).toBeInstanceOf(TasklistAgentStepTimeoutError)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('外部取消会立即透传 AbortError，不会误报成阶段超时', async () => {
        const abortController = new AbortController()
        const result = runTasklistAgentModelStep({
            operation: () => new Promise<never>(() => undefined),
            signal: abortController.signal,
            stage: 'tasklist-draft',
            timeoutMs: 300_000,
        })
        const rejection = expect(result).rejects.toMatchObject({
            name: 'AbortError',
        })

        abortController.abort()

        await rejection
        expect(vi.getTimerCount()).toBe(0)
    })
})
