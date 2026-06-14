'use client'

import { useState } from 'react'

import {
    type ChatModel,
    type ChatModelGroup,
    type ChatModelsInitialState,
    findPublicChatModel,
    groupPublicChatModels,
    type PublicChatModel,
    resolveInitialChatModel,
} from '@/lib/ai/models'

interface UseChatModelsResult {
    hasAvailableModels: boolean
    isLoading: boolean
    model: ChatModel
    modelError: string | null
    modelGroups: ChatModelGroup[]
    selectedModel: PublicChatModel | null
    setModel: (model: ChatModel) => void
}

export function useChatModels(initialState: ChatModelsInitialState): UseChatModelsResult {
    const [model, setModel] = useState<ChatModel>(() => resolveInitialChatModel(initialState))
    const [models] = useState<PublicChatModel[]>(initialState.models)
    const [modelError] = useState<string | null>(initialState.modelError)

    return {
        hasAvailableModels: models.length > 0,
        isLoading: false,
        model,
        modelError,
        modelGroups: groupPublicChatModels(models),
        selectedModel: findPublicChatModel(models, model),
        setModel,
    }
}
