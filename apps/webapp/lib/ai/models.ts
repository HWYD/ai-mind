export type ChatModel = string

export type ChatModelProvider = 'ollama' | 'deepseek' | 'qwen' | 'doubao'
export type ChatModelFamily = ChatModelProvider | 'kimi'

export interface PublicChatModel {
    family: ChatModelFamily
    id: ChatModel
    label: string
    provider: ChatModelProvider
}

export interface PublicChatModelList {
    defaultModelId: ChatModel
    models: PublicChatModel[]
}

export interface ChatModelsInitialState {
    defaultModelId: ChatModel
    modelError: string | null
    models: PublicChatModel[]
}

export interface ChatModelGroup {
    id: 'online' | 'local'
    label: '线上模型' | '本地模型'
    models: PublicChatModel[]
}

// 前端在模型接口完成加载前的临时占位值。
// Step 13 后它不再代表真实可选模型集合，只用于首屏 hydration 期间的稳定初值。
export const defaultChatModel: ChatModel = 'ollama/qwen3-8b'

export function findPublicChatModel(models: PublicChatModel[], modelId: ChatModel): PublicChatModel | null {
    return models.find(model => model.id === modelId) ?? null
}

export function groupPublicChatModels(models: PublicChatModel[]): ChatModelGroup[] {
    const onlineModels = models.filter(model => model.provider !== 'ollama')
    const localModels = models.filter(model => model.provider === 'ollama')

    const groups: ChatModelGroup[] = []

    if (onlineModels.length > 0) {
        groups.push({
            id: 'online',
            label: '线上模型',
            models: onlineModels,
        })
    }

    if (localModels.length > 0) {
        groups.push({
            id: 'local',
            label: '本地模型',
            models: localModels,
        })
    }

    return groups
}

export function parsePublicChatModelList(value: unknown): PublicChatModelList | null {
    if (!isRecord(value) || typeof value.defaultModelId !== 'string' || !Array.isArray(value.models)) {
        return null
    }

    const models = value.models.map(parsePublicChatModel)

    if (models.some(model => !model)) {
        return null
    }

    return {
        defaultModelId: value.defaultModelId,
        models: models.filter((model): model is PublicChatModel => model !== null),
    }
}

export function resolveInitialChatModel(initialState: ChatModelsInitialState): ChatModel {
    if (findPublicChatModel(initialState.models, initialState.defaultModelId)) {
        return initialState.defaultModelId
    }

    return initialState.models[0]?.id ?? defaultChatModel
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isChatModelProvider(value: unknown): value is ChatModelProvider {
    return value === 'ollama' || value === 'deepseek' || value === 'qwen' || value === 'doubao'
}

function isChatModelFamily(value: unknown): value is ChatModelFamily {
    return value === 'ollama' || value === 'deepseek' || value === 'qwen' || value === 'doubao' || value === 'kimi'
}

function parsePublicChatModel(value: unknown): PublicChatModel | null {
    if (!isRecord(value)) {
        return null
    }

    if (
        typeof value.id !== 'string' ||
        typeof value.label !== 'string' ||
        !isChatModelProvider(value.provider) ||
        !isChatModelFamily(value.family)
    ) {
        return null
    }

    return {
        family: value.family,
        id: value.id,
        label: value.label,
        provider: value.provider,
    }
}
