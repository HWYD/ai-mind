import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiMindModelCatalogItem } from '@/lib/ai/model-provider'
import { ModelSelectionError, resolveModelSelection } from '@/lib/ai/model-provider'

const testState = vi.hoisted(() => ({
    catalog: [] as AiMindModelCatalogItem[],
}))

vi.mock('@/lib/ai/model-provider/catalog/model-catalog', () => ({
    get modelCatalog() {
        return testState.catalog
    },
}))

function createCatalogItem(overrides: Partial<AiMindModelCatalogItem> = {}): AiMindModelCatalogItem {
    return {
        availableIn: ['development', 'production'],
        capabilities: {
            chat: true,
            embedding: false,
            jsonOutput: true,
            streaming: true,
            tasklist: true,
            toolCalling: true,
        },
        enabled: true,
        family: 'ollama',
        id: 'ollama/qwen3-8b',
        label: 'Qwen3 8B Local',
        modelKey: 'qwen3-8b',
        provider: 'ollama',
        providerModel: 'qwen3:8b',
        ...overrides,
    }
}

describe('resolveModelSelection', () => {
    afterEach(() => {
        testState.catalog = []
        vi.unstubAllEnvs()
    })

    it('未传 modelId 时使用默认模型，并返回解析后的 selection', () => {
        testState.catalog = [createCatalogItem()]

        const selection = resolveModelSelection({
            routeType: 'chat',
        })

        expect(selection).toEqual(
            expect.objectContaining({
                modelId: 'ollama/qwen3-8b',
                provider: 'ollama',
                providerModel: 'qwen3:8b',
                routeType: 'chat',
            })
        )
    })

    it('delivery-chain routeType 复用 chat capability 解析模型', () => {
        testState.catalog = [createCatalogItem()]

        const selection = resolveModelSelection({
            routeType: 'delivery-chain',
        })

        expect(selection).toEqual(
            expect.objectContaining({
                modelId: 'ollama/qwen3-8b',
                routeType: 'delivery-chain',
            })
        )
    })

    it('delivery-chain 的用户业务模型不因 Contract JSON 能力被拒绝', () => {
        testState.catalog = [
            createCatalogItem({
                capabilities: {
                    chat: true,
                    embedding: false,
                    jsonOutput: false,
                    streaming: true,
                    tasklist: true,
                    toolCalling: true,
                },
            }),
        ]

        expect(resolveModelSelection({ routeType: 'delivery-chain' })).toEqual(expect.objectContaining({ modelId: 'ollama/qwen3-8b' }))
    })

    it('非法 modelId 会 fail closed', () => {
        testState.catalog = [createCatalogItem()]

        expect(() =>
            resolveModelSelection({
                modelId: 'unknown/model',
                routeType: 'chat',
            })
        ).toThrowError(ModelSelectionError)
    })

    it('provider 不在 allowed providers 中时会 fail closed', () => {
        testState.catalog = [
            createCatalogItem({
                family: 'qwen',
                id: 'qwen/qwen3.6-flash',
                modelKey: 'qwen3.6-flash',
                provider: 'qwen',
                providerModel: 'qwen3.6-flash',
            }),
            createCatalogItem(),
        ]
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/qwen3.6-flash')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')

        expect(() =>
            resolveModelSelection({
                modelId: 'ollama/qwen3-8b',
                routeType: 'chat',
            })
        ).toThrowError(expect.objectContaining({ code: 'MODEL_PROVIDER_NOT_ALLOWED' }))
    })

    it('production 环境不允许 development-only 模型', () => {
        testState.catalog = [
            createCatalogItem({
                availableIn: ['development'],
            }),
        ]
        vi.stubEnv('NODE_ENV', 'production')

        expect(() =>
            resolveModelSelection({
                modelId: 'ollama/qwen3-8b',
                routeType: 'chat',
            })
        ).toThrowError(expect.objectContaining({ code: 'MODEL_NOT_AVAILABLE_IN_ENVIRONMENT' }))
    })

    it('routeType 不匹配时 fail closed', () => {
        testState.catalog = [
            createCatalogItem({
                availableIn: ['development', 'production'],
                capabilities: {
                    chat: true,
                    embedding: false,
                    jsonOutput: true,
                    streaming: true,
                    tasklist: false,
                    toolCalling: false,
                },
                family: 'qwen',
                id: 'qwen/chat-only',
                modelKey: 'chat-only',
                provider: 'qwen',
                providerModel: 'chat-only',
            }),
        ]
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/chat-only')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')

        expect(() =>
            resolveModelSelection({
                modelId: 'qwen/chat-only',
                routeType: 'tasklist',
            })
        ).toThrowError(expect.objectContaining({ code: 'MODEL_DOES_NOT_SUPPORT_ROUTE_TYPE' }))
    })

    it('需要 tool calling 但模型未声明时 fail closed', () => {
        testState.catalog = [
            createCatalogItem({
                availableIn: ['development', 'production'],
                capabilities: {
                    chat: true,
                    embedding: false,
                    jsonOutput: true,
                    streaming: true,
                    tasklist: true,
                    toolCalling: false,
                },
                family: 'qwen',
                id: 'qwen/no-tool-calling',
                modelKey: 'no-tool-calling',
                provider: 'qwen',
                providerModel: 'no-tool-calling',
            }),
        ]
        vi.stubEnv('AI_MIND_DEFAULT_MODEL_ID', 'qwen/no-tool-calling')
        vi.stubEnv('AI_MIND_ALLOWED_PROVIDERS', 'qwen')

        expect(() =>
            resolveModelSelection({
                modelId: 'qwen/no-tool-calling',
                requireToolCalling: true,
                routeType: 'chat',
            })
        ).toThrowError(expect.objectContaining({ code: 'MODEL_DOES_NOT_SUPPORT_TOOL_CALLING' }))
    })

    it('需要 JSON output 但模型未声明时 fail closed', () => {
        testState.catalog = [
            createCatalogItem({
                capabilities: {
                    chat: true,
                    embedding: false,
                    jsonOutput: false,
                    streaming: true,
                    tasklist: true,
                    toolCalling: true,
                },
            }),
        ]

        expect(() =>
            resolveModelSelection({
                requireJsonOutput: true,
                routeType: 'delivery-chain',
            })
        ).toThrowError(expect.objectContaining({ code: 'MODEL_DOES_NOT_SUPPORT_JSON_OUTPUT' }))
    })
})
