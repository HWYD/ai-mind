/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useChatModels } from '@/components/instamind/use-chat-models'
import { modelCatalog } from '@/lib/ai/model-provider/catalog/model-catalog'
import type { ChatModelsInitialState } from '@/lib/ai/models'

function createPublicModel(modelId: string) {
    const item = modelCatalog.find(candidate => candidate.id === modelId)

    if (!item) {
        throw new Error(`Model catalog item not found in test: ${modelId}`)
    }

    return {
        family: item.family,
        id: item.id,
        label: item.label,
        provider: item.provider,
    }
}

afterEach(() => {
    cleanup()
})

describe('useChatModels', () => {
    it('使用服务端注入的初始模型列表，并按线上 / 本地分组', async () => {
        // 注意：前端首屏模型列表要跟随当前 catalog 的 provider，不要把 deepseek family 写死到某个供应商。
        const initialState: ChatModelsInitialState = {
            defaultModelId: 'qwen/qwen3.6-flash',
            modelError: null,
            models: [
                createPublicModel('deepseek/deepseek-v4-flash'),
                createPublicModel('qwen/qwen3.6-flash'),
                createPublicModel('qwen/qwen3.7-max'),
                createPublicModel('ollama/qwen3-8b'),
            ],
        }

        const { result } = renderHook(() => useChatModels(initialState))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.model).toBe('qwen/qwen3.6-flash')
        expect(result.current.selectedModel?.label).toBe('qwen3.6-flash')
        expect(result.current.selectedModel?.family).toBe('qwen')
        expect(result.current.modelGroups.map(group => group.label)).toEqual(['线上模型', '本地模型'])
        expect(result.current.modelGroups[0]?.models.map(model => model.id)).toEqual([
            'deepseek/deepseek-v4-flash',
            'qwen/qwen3.6-flash',
            'qwen/qwen3.7-max',
        ])
        expect(result.current.modelGroups[1]?.models.map(model => model.id)).toEqual(['ollama/qwen3-8b'])
    })

    it('服务端初始状态没有可用模型时，返回可展示的错误状态', async () => {
        const initialState: ChatModelsInitialState = {
            defaultModelId: 'ollama/qwen3-8b',
            modelError: '当前没有可用模型，请检查服务端模型配置。',
            models: [],
        }

        const { result } = renderHook(() => useChatModels(initialState))

        await waitFor(() => {
            expect(result.current.modelError).toBe('当前没有可用模型，请检查服务端模型配置。')
        })

        expect(result.current.hasAvailableModels).toBe(false)
        expect(result.current.modelGroups).toEqual([])
    })
})
