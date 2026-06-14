/** @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useChatModels } from '@/components/instamind/use-chat-models'
import type { ChatModelsInitialState } from '@/lib/ai/models'

afterEach(() => {
    cleanup()
})

describe('useChatModels', () => {
    it('使用服务端注入的初始模型列表，并按线上 / 本地分组', async () => {
        const initialState: ChatModelsInitialState = {
            defaultModelId: 'qwen/qwen3.6-plus',
            modelError: null,
            models: [
                { id: 'deepseek/deepseek-v4-flash', label: 'deepseek-v4-flash', provider: 'deepseek' },
                { id: 'qwen/qwen3.6-plus', label: 'qwen3.6-plus', provider: 'qwen' },
                { id: 'qwen/qwen3.7-plus', label: 'qwen3.7-plus', provider: 'qwen' },
                { id: 'ollama/qwen3-8b', label: 'qwen3-8b', provider: 'ollama' },
            ],
        }

        const { result } = renderHook(() => useChatModels(initialState))

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.model).toBe('qwen/qwen3.6-plus')
        expect(result.current.selectedModel?.label).toBe('qwen3.6-plus')
        expect(result.current.modelGroups.map(group => group.label)).toEqual(['线上模型', '本地模型'])
        expect(result.current.modelGroups[0]?.models.map(model => model.id)).toEqual([
            'qwen/qwen3.6-plus',
            'qwen/qwen3.7-plus',
            'deepseek/deepseek-v4-flash',
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
