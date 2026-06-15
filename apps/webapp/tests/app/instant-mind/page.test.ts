import { describe, expect, it, vi } from 'vitest'

const connectionMock = vi.hoisted(() => vi.fn())
const resolveChatModelsInitialStateMock = vi.hoisted(() =>
    vi.fn(() => ({
        defaultModelId: 'qwen/qwen3.6-flash',
        modelError: null,
        models: [
            {
                id: 'qwen/qwen3.6-flash',
                label: 'qwen3.6-flash',
                provider: 'qwen',
            },
        ],
    }))
)

vi.mock('next/server', () => ({
    connection: connectionMock,
}))

vi.mock('@/components/instamind/instantmind-page', () => ({
    default: (props: unknown) => props,
}))

vi.mock('@/lib/ai/model-provider', () => ({
    resolveChatModelsInitialState: resolveChatModelsInitialStateMock,
}))

describe('/instant-mind page', () => {
    it('等待请求期 connection 后再解析模型初始态', async () => {
        let releaseConnection: (() => void) | undefined
        connectionMock.mockImplementationOnce(
            () =>
                new Promise<void>(resolve => {
                    releaseConnection = resolve
                })
        )
        const { default: InstantMindRoutePage } = await import('@/app/instant-mind/page')
        const pagePromise = InstantMindRoutePage()

        expect(connectionMock).toHaveBeenCalledTimes(1)
        expect(resolveChatModelsInitialStateMock).not.toHaveBeenCalled()

        releaseConnection?.()
        const result = await pagePromise

        expect(resolveChatModelsInitialStateMock).toHaveBeenCalledTimes(1)
        expect((result as { props?: { initialChatModelsState?: unknown } }).props?.initialChatModelsState).toEqual({
            defaultModelId: 'qwen/qwen3.6-flash',
            modelError: null,
            models: [
                {
                    id: 'qwen/qwen3.6-flash',
                    label: 'qwen3.6-flash',
                    provider: 'qwen',
                },
            ],
        })
    })
})
